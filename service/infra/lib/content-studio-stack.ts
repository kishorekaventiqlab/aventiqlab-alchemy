/**
 * AL2 + AL7 + AL5 stack.
 *
 * AL2: the request-service Lambda (container image of ../.. — the Fastify app
 * via src/lambda.ts) behind a Function URL. AuthType NONE at the edge — the
 * JWT preHandler is the actual gate.
 *
 * AL7: the content bucket (see content-bucket.ts).
 *
 * AL5: the render-job DynamoDB table + the one-shot Fargate render worker
 * (see render-compute.ts). The Lambda does POST /v1/render (202 + RunTask) +
 * GET /v1/render/{id} + POST /v1/artifacts/promote; the Fargate task renders.
 *
 * Two Secrets Manager containers, both CREATE-only placeholders that ops
 * replaces out of band: ALCHEMY_SERVICE_JWT_SECRET (astra <-> alchemy service
 * tokens) and OPENROUTER_API_KEY (AL3 /v1/generate's model calls).
 *
 * `cdk deploy` is an explicitly-authorized step — not run automatically.
 */
import { Stack, type StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import {
  DockerImageFunction,
  DockerImageCode,
  FunctionUrlAuthType,
  Architecture,
} from "aws-cdk-lib/aws-lambda";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { ContentBucket } from "./content-bucket.js";
import { RenderCompute } from "./render-compute.js";

export class AlchemyContentStudioStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const scratchRetentionDays = Number(
      this.node.tryGetContext("alchemy:scratchRetentionDays") ?? 30,
    );

    // ---- AL7: content bucket ------------------------------------------------
    const content = new ContentBucket(this, "Content", { scratchRetentionDays });

    // ---- The shared service secret (astra <-> alchemy, contract §2.3) -------
    // Value is exchanged with astra out of band (AL10-adjacent); CDK only
    // creates the container and grants the Lambda read.
    // CDK generates a random value on CREATE only; ops then replaces it with the
    // real shared secret exchanged with astra over a secure channel (contract
    // §11 / AL10-adjacent). CloudFormation does NOT reset a manually-changed
    // secret on subsequent deploys, so the generated value is just a
    // placeholder that never gets used.
    const jwtSecret = new Secret(this, "ServiceJwtSecret", {
      secretName: "alchemy/service-secrets",
      description:
        "ALCHEMY_SERVICE_JWT_SECRET — HS256 shared secret for astra -> alchemy service tokens. Replace the generated value with the one exchanged with astra out of band.",
    });

    // ---- The OpenRouter API key (AL3 /v1/generate's model calls) -----------
    // Same pattern as the JWT secret: CDK creates the container with a random
    // CREATE-only placeholder value; ops replaces it with the real OpenRouter
    // key out of band. Plain string (no JSON key) — config.ts reads it as-is.
    const openRouterSecret = new Secret(this, "OpenRouterApiKey", {
      secretName: "alchemy/openrouter-api-key",
      description:
        "OPENROUTER_API_KEY — used by POST /v1/generate's model calls. Replace the generated placeholder with the real OpenRouter key.",
    });

    // ---- AL2: the request-service Lambda -----------------------------------
    const logGroup = new LogGroup(this, "RequestServiceLogs", {
      retention: RetentionDays.ONE_MONTH,
    });

    const service = new DockerImageFunction(this, "RequestService", {
      // Build context = the service/ directory (this file is at service/infra/lib).
      code: DockerImageCode.fromImageAsset("..", {
        file: "Dockerfile",
        exclude: ["infra", "cdk.out", "node_modules", "dist", "**/*.test.ts"],
      }),
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(29), // Function URL hard cap is 15 min; keep request work short
      logGroup,
      environment: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        // AWS_REGION is set by the Lambda runtime — do not set it here.
        // Resolve the JWT secret from Secrets Manager by name (the config.ts
        // env -> SM precedence). Pass the ARN, not the value. The secret is a
        // plain string (CDK's default GenerateSecretString, and what ops
        // writes back) — no ALCHEMY_SERVICE_JWT_SECRET_JSON_KEY, so config.ts
        // reads it as-is rather than trying to JSON-parse it.
        ALCHEMY_SERVICE_JWT_SECRET_ARN: jwtSecret.secretArn,
        // AL3 persists generated artifacts here; AL6 validates + signs pointers
        // against this bucket name.
        ALCHEMY_CONTENT_BUCKET: content.bucket.bucketName,
        // Resolved from Secrets Manager the same way as the JWT secret; the
        // real value is pasted in by ops out of band (AL10-adjacent).
        OPENROUTER_API_KEY_ARN: openRouterSecret.secretArn,
      },
    });

    jwtSecret.grantRead(service);
    openRouterSecret.grantRead(service);

    // The request Lambda serves /v1/generate (AL3), /v1/artifacts/sign (AL6),
    // POST+GET /v1/render (AL5), and POST /v1/artifacts/promote (AL5):
    //   AL3 -> write generated artifacts
    //   AL6 -> HeadObject + presign a GET across all three prefixes
    // A presigned URL grants exactly the signer's GetObject, so grantReadForPresign
    // is both AL3's read grant and AL6's presign capability.
    content.grantGeneratedWrite(service);
    content.grantReadForPresign(service);
    // AL5 promote: HeadObject (covered by grantReadForPresign) + CopyObject's
    // write half into produced/*.
    content.grantProducedWrite(service);
    // AL5 POST /v1/render stashes the request body under renders/*.
    content.grantRendersWrite(service);

    // ---- AL5: render compute (job table + Fargate worker) -----------------
    const renderCompute = new RenderCompute(this, "Render", {
      content,
      serviceSecret: jwtSecret,
      jobTtlDays: 30,
    });
    renderCompute.grantLambdaJobAccess(service);
    service.addToRolePolicy(renderCompute.runTaskStatement);
    service.addToRolePolicy(renderCompute.passRoleStatement);

    service.addEnvironment("ALCHEMY_RENDER_JOBS_TABLE", renderCompute.jobsTable.tableName);
    service.addEnvironment("ALCHEMY_RENDER_ECS_CLUSTER", renderCompute.cluster.clusterArn);
    service.addEnvironment("ALCHEMY_RENDER_TASK_DEFINITION", renderCompute.taskDefinitionArn);
    service.addEnvironment("ALCHEMY_RENDER_CONTAINER_NAME", renderCompute.containerName);
    service.addEnvironment("ALCHEMY_RENDER_SUBNETS", renderCompute.subnetIds.join(","));
    service.addEnvironment("ALCHEMY_RENDER_SECURITY_GROUPS", renderCompute.securityGroupIds.join(","));

    const fnUrl = service.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE, // JWT preHandler is the gate
    });

    new CfnOutput(this, "ServiceUrl", { value: fnUrl.url });
    new CfnOutput(this, "ContentBucketName", { value: content.bucket.bucketName });
    new CfnOutput(this, "ServiceJwtSecretArn", { value: jwtSecret.secretArn });
    new CfnOutput(this, "OpenRouterApiKeySecretArn", { value: openRouterSecret.secretArn });
    new CfnOutput(this, "RenderJobsTableName", { value: renderCompute.jobsTable.tableName });
    new CfnOutput(this, "RenderEcsClusterArn", { value: renderCompute.cluster.clusterArn });
  }
}
