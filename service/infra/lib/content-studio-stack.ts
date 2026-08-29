/**
 * AL2 + AL7 stack.
 *
 * AL2: the request-service Lambda (container image of ../.. — the Fastify app
 * via src/lambda.ts) behind a Function URL. AuthType NONE at the edge — the
 * JWT preHandler is the actual gate.
 *
 * AL7: the content bucket (see content-bucket.ts).
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
import { RetentionDays } from "aws-cdk-lib/aws-logs";
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
    const jwtSecret = new Secret(this, "ServiceJwtSecret", {
      secretName: "alchemy/service-secrets",
      description:
        "ALCHEMY_SERVICE_JWT_SECRET — HS256 shared secret for astra -> alchemy service tokens. Set the value out of band.",
    });

    // ---- AL2: the request-service Lambda -----------------------------------
    const service = new DockerImageFunction(this, "RequestService", {
      code: DockerImageCode.fromImageAsset("../..", {
        file: "service/Dockerfile",
      }),
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(29), // Function URL hard cap is 15 min; keep request work short
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        AWS_REGION: this.region,
        // Resolve the JWT secret from Secrets Manager by name (the config.ts
        // env -> SM precedence). Pass the ARN, not the value.
        ALCHEMY_SERVICE_JWT_SECRET_ARN: jwtSecret.secretArn,
        ALCHEMY_SERVICE_JWT_SECRET_JSON_KEY: "ALCHEMY_SERVICE_JWT_SECRET",
      },
    });

    jwtSecret.grantRead(service);

    // AL2 does not write S3, but grant read-for-presign now so AL6 (same
    // Lambda) needs no IAM change later. AL3's grantWriteGenerated is added
    // when AL3's route ships.
    content.grantReadForPresign(service);

    const fnUrl = service.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE, // JWT preHandler is the gate
    });

    new CfnOutput(this, "ServiceUrl", { value: fnUrl.url });
    new CfnOutput(this, "ContentBucketName", { value: content.bucket.bucketName });
    new CfnOutput(this, "ServiceJwtSecretArn", { value: jwtSecret.secretArn });
  }
}
