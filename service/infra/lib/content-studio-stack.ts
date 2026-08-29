/**
 * AL2 + AL7 stack.
 *
 * AL2: the request-service Lambda (container image of ../.. — the Fastify app
 * via src/lambda.ts) behind a Function URL. AuthType NONE at the edge — the
 * JWT preHandler is the actual gate.
 *
 * AL7: the content bucket (see content-bucket.ts) — lifecycle, encryption,
 * public-access block, versioning, and the reusable grant* helpers. No grant
 * is attached to a principal here; the consuming task wires its own.
 *
 * NOT in this stack yet: AL5 render compute (Fargate/Batch — its own construct),
 * the OPENROUTER_API_KEY secret wiring (AL3), API Gateway (only if we outgrow
 * the Function URL).
 *
 * Nothing here is deployed as part of Phase 2 — `cdk deploy` is a later,
 * explicitly-authorized step (per-repo deploy roles are not yet provisioned).
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
        // env -> SM precedence). Pass the ARN, not the value.
        ALCHEMY_SERVICE_JWT_SECRET_ARN: jwtSecret.secretArn,
        ALCHEMY_SERVICE_JWT_SECRET_JSON_KEY: "ALCHEMY_SERVICE_JWT_SECRET",
      },
    });

    jwtSecret.grantRead(service);

    // S3 grants are wired by the tasks that need them, not here:
    //   AL3 -> content.grantGeneratedWrite(service) + content.grantReadForPresign(service)
    //   AL5 -> content.grantRendersWrite(renderRole) + content.grantPromoteToProduced(renderRole)
    // The ContentBucket construct (AL7) exposes them; nothing is attached yet.
    void content;

    const fnUrl = service.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE, // JWT preHandler is the gate
    });

    new CfnOutput(this, "ServiceUrl", { value: fnUrl.url });
    new CfnOutput(this, "ContentBucketName", { value: content.bucket.bucketName });
    new CfnOutput(this, "ServiceJwtSecretArn", { value: jwtSecret.secretArn });
  }
}
