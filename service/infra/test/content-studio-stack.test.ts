import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AlchemyContentStudioStack } from "../lib/content-studio-stack.js";

const ACCOUNT = "880636108741";
const REGION = "ap-south-1";

function synthStack() {
  const app = new App({
    context: {
      "alchemy:scratchRetentionDays": 30,
      // Pre-seed AZs so the AL5 VPC never needs a real cross-account lookup
      // in tests (mirrors bin/app.ts).
      [`availability-zones:account=${ACCOUNT}:region=${REGION}`]: [`${REGION}a`, `${REGION}b`],
    },
  });
  const stack = new AlchemyContentStudioStack(app, "AlchemyContentStudio", {
    env: { account: ACCOUNT, region: REGION },
  });
  return Template.fromStack(stack);
}

test("stack synthesizes exactly one S3 bucket and one Lambda", () => {
  const t = synthStack();
  t.resourceCountIs("AWS::S3::Bucket", 1);
  t.resourceCountIs("AWS::Lambda::Function", 1);
});

test("the request Lambda is an ARM64 container image with a Function URL (auth NONE, streamed)", () => {
  const t = synthStack();
  t.hasResourceProperties("AWS::Lambda::Function", {
    PackageType: "Image",
    Architectures: ["arm64"],
  });
  // RESPONSE_STREAM, not the BUFFERED default: BUFFERED hard-caps the
  // client-visible response at 29s regardless of the Lambda's own Timeout,
  // which killed a real ~30s /v1/generate call mid-request. lambda.ts is
  // wrapped with awslambda.streamifyResponse() to match.
  t.hasResourceProperties("AWS::Lambda::Url", { AuthType: "NONE", InvokeMode: "RESPONSE_STREAM" });
});

test("the Lambda gets both secret ARNs in its env, never a raw value", () => {
  const t = synthStack();
  const fns = t.findResources("AWS::Lambda::Function");
  const env = Object.values(fns)[0]!.Properties.Environment.Variables as Record<string, unknown>;
  assert.ok("ALCHEMY_SERVICE_JWT_SECRET_ARN" in env, "passes the JWT secret ARN");
  assert.ok(!("ALCHEMY_SERVICE_JWT_SECRET" in env), "never passes the raw JWT secret");
  assert.ok("OPENROUTER_API_KEY_ARN" in env, "passes the OpenRouter secret ARN");
  assert.ok(!("OPENROUTER_API_KEY" in env), "never passes the raw OpenRouter key");
  assert.ok(!("AWS_REGION" in env), "does not set the reserved AWS_REGION");
  assert.ok("ALCHEMY_CONTENT_BUCKET" in env, "passes the content bucket name (AL3 + AL6)");
});

test("the request Lambda gets the AL3+AL5+AL6 S3 grants: write generated/renders/produced, read all prefixes", () => {
  const t = synthStack();
  const policies = t.findResources("AWS::IAM::Policy");
  const allDocs = JSON.stringify(Object.values(policies).map((p) => p.Properties.PolicyDocument));
  // AL3: write generated/*  |  AL6: read (for presign) generated/renders/produced
  // AL5: write renders/* (stash the request) + write produced/* (promote)
  assert.ok(allDocs.includes("s3:PutObject"), "write grant present");
  assert.ok(allDocs.includes("s3:GetObject"), "read/presign grant present");
  assert.ok(allDocs.includes("generated/*"), "scoped to generated/");
  assert.ok(allDocs.includes("renders/*"), "covers renders/");
  assert.ok(allDocs.includes("produced/*"), "covers produced/");
});

test("AL5: exactly one render-jobs DynamoDB table with an experience_id GSI + TTL", () => {
  const t = synthStack();
  t.resourceCountIs("AWS::DynamoDB::Table", 1);
  t.hasResourceProperties("AWS::DynamoDB::Table", {
    TableName: "alchemy-render-jobs",
    TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    GlobalSecondaryIndexes: [
      {
        IndexName: "by-experience",
        KeySchema: [{ AttributeName: "experience_id", KeyType: "HASH" }],
      },
    ],
  });
});

test("AL5: exactly one Fargate render task (4 vCPU / 8 GB / 40 GiB ephemeral storage, no inbound port mappings)", () => {
  const t = synthStack();
  t.resourceCountIs("AWS::ECS::TaskDefinition", 1);
  t.hasResourceProperties("AWS::ECS::TaskDefinition", {
    RequiresCompatibilities: ["FARGATE"],
    Cpu: "4096",
    Memory: "8192",
    // The platform default (20 GiB) was exhausted extracting the render
    // image (10+ GB compressed — torch/Chatterbox/Remotion), confirmed live
    // via a CannotPullContainerError "no space left on device".
    EphemeralStorage: { SizeInGiB: 40 },
  });
  const taskDefs = t.findResources("AWS::ECS::TaskDefinition");
  const containers = Object.values(taskDefs)[0]!.Properties.ContainerDefinitions as Array<{
    PortMappings?: unknown[];
  }>;
  for (const c of containers) {
    assert.ok(!c.PortMappings || c.PortMappings.length === 0, "the render worker has no inbound ports");
  }
});

test("AL5: the Lambda can RunTask + PassRole for the render task, and read/write the job table", () => {
  const t = synthStack();
  const policies = t.findResources("AWS::IAM::Policy");
  const allDocs = JSON.stringify(Object.values(policies).map((p) => p.Properties.PolicyDocument));
  assert.ok(allDocs.includes("ecs:RunTask"), "Lambda can RunTask");
  assert.ok(allDocs.includes("iam:PassRole"), "Lambda can PassRole to the task roles");
  assert.ok(allDocs.includes("dynamodb:PutItem"), "Lambda can create a job record");
  assert.ok(allDocs.includes("dynamodb:GetItem"), "Lambda can read a job record");
  assert.ok(allDocs.includes("dynamodb:Query"), "Lambda can query the experience_id GSI");
});

test("AL5: the render task role can UpdateItem on the job table and reach the TTS cache + renders/produced, but NOT PutItem/RunTask", () => {
  const t = synthStack();
  const policies = t.findResources("AWS::IAM::Policy");
  const allDocs = JSON.stringify(Object.values(policies).map((p) => p.Properties.PolicyDocument));
  assert.ok(allDocs.includes("dynamodb:UpdateItem"), "task role can update its own job record");
  assert.ok(allDocs.includes("tts-cache/*"), "task role reaches the TTS cache prefix");
});

test("AL5: the Lambda's env carries the render compute wiring, no secret values", () => {
  const t = synthStack();
  const fns = t.findResources("AWS::Lambda::Function");
  const requestFn = Object.values(fns).find(
    (f) => (f.Properties.Environment?.Variables as Record<string, unknown> | undefined)?.ALCHEMY_RENDER_JOBS_TABLE,
  );
  assert.ok(requestFn, "the request Lambda has the render env vars");
  const env = requestFn!.Properties.Environment.Variables as Record<string, unknown>;
  for (const key of [
    "ALCHEMY_RENDER_JOBS_TABLE",
    "ALCHEMY_RENDER_ECS_CLUSTER",
    "ALCHEMY_RENDER_TASK_DEFINITION",
    "ALCHEMY_RENDER_CONTAINER_NAME",
    "ALCHEMY_RENDER_SUBNETS",
    "ALCHEMY_RENDER_SECURITY_GROUPS",
  ]) {
    assert.ok(key in env, `env has ${key}`);
  }
});

test("the Lambda can read the JWT secret", () => {
  const t = synthStack();
  const policies = t.findResources("AWS::IAM::Policy");
  const allDocs = JSON.stringify(Object.values(policies).map((p) => p.Properties.PolicyDocument));
  assert.ok(allDocs.includes("secretsmanager:GetSecretValue"), "grants GetSecretValue");
});

test("both Secrets Manager entries carry no literal secret value in the template", () => {
  const t = synthStack();
  const secrets = t.findResources("AWS::SecretsManager::Secret");
  const byName = new Map(Object.values(secrets).map((s) => [s.Properties.Name, s.Properties]));

  assert.equal(byName.size, 2, "exactly two secrets: the JWT secret and the OpenRouter key");
  for (const name of ["alchemy/service-secrets", "alchemy/openrouter-api-key"]) {
    const props = byName.get(name);
    assert.ok(props, `${name} exists`);
    assert.equal(props!.SecretString, undefined, `${name} has no literal secret value in the synthesized template`);
  }
  // CDK's default GenerateSecretString: {} produces a random value on CREATE
  // only; ops replaces it with the real value (astra-shared secret / OpenRouter
  // key) and redeploys don't reset it. That's acceptable — the generated value
  // is a never-used placeholder.
});
