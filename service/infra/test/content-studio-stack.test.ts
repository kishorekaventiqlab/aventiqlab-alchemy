import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AlchemyContentStudioStack } from "../lib/content-studio-stack.js";

function synthStack() {
  const app = new App({ context: { "alchemy:scratchRetentionDays": 30 } });
  const stack = new AlchemyContentStudioStack(app, "AlchemyContentStudio", {
    env: { account: "880636108741", region: "ap-south-1" },
  });
  return Template.fromStack(stack);
}

test("stack synthesizes exactly one S3 bucket and one Lambda", () => {
  const t = synthStack();
  t.resourceCountIs("AWS::S3::Bucket", 1);
  t.resourceCountIs("AWS::Lambda::Function", 1);
});

test("the request Lambda is an ARM64 container image with a Function URL (auth NONE)", () => {
  const t = synthStack();
  t.hasResourceProperties("AWS::Lambda::Function", {
    PackageType: "Image",
    Architectures: ["arm64"],
  });
  t.hasResourceProperties("AWS::Lambda::Url", { AuthType: "NONE" });
});

test("the Lambda gets the JWT secret ARN in its env, never the value", () => {
  const t = synthStack();
  const fns = t.findResources("AWS::Lambda::Function");
  const env = Object.values(fns)[0]!.Properties.Environment.Variables as Record<string, unknown>;
  assert.ok("ALCHEMY_SERVICE_JWT_SECRET_ARN" in env, "passes the ARN");
  assert.ok(!("ALCHEMY_SERVICE_JWT_SECRET" in env), "never passes the raw secret");
  assert.ok(!("AWS_REGION" in env), "does not set the reserved AWS_REGION");
});

test("no S3 grant is attached to the Lambda by the stack itself (AL7: tasks wire their own)", () => {
  const t = synthStack();
  const policies = t.findResources("AWS::IAM::Policy");
  const allDocs = JSON.stringify(Object.values(policies).map((p) => p.Properties.PolicyDocument));
  // The only S3 action the AL2 stack should grant is none — AL3/AL5/AL6 add theirs.
  assert.ok(!allDocs.includes("s3:PutObject"), "no PutObject grant yet");
  assert.ok(!allDocs.includes("s3:GetObject"), "no GetObject grant yet");
});

test("the Lambda can read the JWT secret", () => {
  const t = synthStack();
  const policies = t.findResources("AWS::IAM::Policy");
  const allDocs = JSON.stringify(Object.values(policies).map((p) => p.Properties.PolicyDocument));
  assert.ok(allDocs.includes("secretsmanager:GetSecretValue"), "grants GetSecretValue");
});

test("the Secrets Manager entry carries no literal secret value in the template", () => {
  const t = synthStack();
  const secrets = t.findResources("AWS::SecretsManager::Secret");
  const props = Object.values(secrets)[0]!.Properties;
  assert.equal(props.SecretString, undefined, "no literal secret value in the synthesized template");
  assert.equal(props.Name, "alchemy/service-secrets");
  // CDK's default GenerateSecretString: {} produces a random value on CREATE
  // only; ops replaces it with the astra-shared secret and redeploys don't
  // reset it. That's acceptable — the generated value is a never-used placeholder.
});
