import { test, before } from "node:test";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { AlchemyStack } from "../lib/alchemy-stack.js";

let template: Template;

before(() => {
  const app = new App();
  const stack = new AlchemyStack(app, "AlchemyFoundation-test", {
    env: { account: "880636108741", region: "ap-south-1" },
    stage: "test",
    allowedOrigins: ["https://aventiqlab.com"],
  });
  template = Template.fromStack(stack);
});

test("only the allowed service families are present", () => {
  const types = new Set(Object.values(template.toJSON().Resources as Record<string, { Type: string }>).map((r) => r.Type.split("::")[1]));
  for (const banned of ["ECS", "EKS", "RDS", "OpenSearchService", "StepFunctions", "Events", "AppSync", "CloudFront", "Bedrock", "SageMaker", "Cognito"]) {
    assert.ok(!types.has(banned), `${banned} must not be provisioned`);
  }
  assert.deepEqual([...types].sort(), ["ApiGateway", "DynamoDB", "IAM", "Lambda", "Logs", "S3", "SecretsManager"]);
});

test("bucket is private, encrypted, versioned, retained, TLS-only", () => {
  template.resourceCountIs("AWS::S3::Bucket", 1);
  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketName: "aventiqlab-alchemy-content-880636108741",
    BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    VersioningConfiguration: { Status: "Enabled" },
    OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
    CorsConfiguration: { CorsRules: [Match.objectLike({ AllowedMethods: ["GET", "HEAD"], AllowedOrigins: ["https://aventiqlab.com"] })] },
  });
  template.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" });
  template.hasResourceProperties("AWS::S3::BucketPolicy", {
    PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } })]) },
  });
});

test("single table with two GSIs, on-demand, encrypted, PITR, retained", () => {
  template.resourceCountIs("AWS::DynamoDB::Table", 1);
  template.hasResourceProperties("AWS::DynamoDB::Table", {
    TableName: "aventiqlab-alchemy-content",
    BillingMode: "PAY_PER_REQUEST",
    KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
    GlobalSecondaryIndexes: [
      Match.objectLike({ IndexName: "GSI1", KeySchema: [{ AttributeName: "GSI1PK", KeyType: "HASH" }, { AttributeName: "GSI1SK", KeyType: "RANGE" }] }),
      Match.objectLike({ IndexName: "GSI2", KeySchema: [{ AttributeName: "GSI2PK", KeyType: "HASH" }, { AttributeName: "GSI2SK", KeyType: "RANGE" }] }),
    ],
    SSESpecification: { SSEEnabled: true },
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    DeletionProtectionEnabled: true,
  });
  template.hasResource("AWS::DynamoDB::Table", { DeletionPolicy: "Retain" });
});

test("two Lambdas on Node 22 / arm64 with explicit log groups and scoped env", () => {
  template.resourceCountIs("AWS::Lambda::Function", 2);
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "alchemy-test-api",
    Runtime: "nodejs22.x",
    Architectures: ["arm64"],
    Environment: { Variables: Match.objectLike({ ALCHEMY_TABLE_NAME: Match.anyValue(), ALCHEMY_BUCKET_NAME: Match.anyValue(), ALCHEMY_SIGNED_URL_TTL_SEC: "900" }) },
  });
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "alchemy-test-authorizer",
    Environment: { Variables: Match.objectLike({ ALCHEMY_READ_TOKEN_SECRET_ARN: Match.anyValue(), ALCHEMY_PUBLISH_TOKEN_SECRET_ARN: Match.anyValue() }) },
  });
  template.resourceCountIs("AWS::Logs::LogGroup", 3);
});

test("API Lambda gets least-privilege DynamoDB + S3 object access and nothing else", () => {
  const policies = template.findResources("AWS::IAM::Policy");
  const statements = Object.values(policies).flatMap((p) => (p.Properties as { PolicyDocument: { Statement: { Action: string | string[]; Resource: unknown }[] } }).PolicyDocument.Statement);
  const actions = new Set(statements.flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action])));
  assert.ok(actions.has("dynamodb:Query"));
  assert.ok(actions.has("dynamodb:BatchWriteItem"));
  assert.ok(actions.has("s3:GetObject"));
  assert.ok(actions.has("s3:PutObject"));
  assert.ok(actions.has("secretsmanager:GetSecretValue"));
  for (const forbidden of ["dynamodb:Scan", "dynamodb:*", "s3:*", "s3:ListBucket", "s3:DeleteObject", "iam:*"]) {
    assert.ok(!actions.has(forbidden), `${forbidden} must not be granted`);
  }
});

test("REST API: open /health, everything else behind the token authorizer", () => {
  template.resourceCountIs("AWS::ApiGateway::RestApi", 1);
  template.hasResourceProperties("AWS::ApiGateway::Authorizer", { Type: "REQUEST", IdentitySource: "method.request.header.Authorization", AuthorizerResultTtlInSeconds: 300 });
  template.hasResourceProperties("AWS::ApiGateway::Method", { HttpMethod: "GET", AuthorizationType: "NONE", ResourceId: Match.anyValue() });
  template.hasResourceProperties("AWS::ApiGateway::Method", { HttpMethod: "ANY", AuthorizationType: "CUSTOM" });
  template.hasResourceProperties("AWS::ApiGateway::Resource", { PathPart: "{proxy+}" });
  template.hasResourceProperties("AWS::ApiGateway::Stage", { StageName: "v1", MethodSettings: Match.arrayWith([Match.objectLike({ ThrottlingRateLimit: 50 })]) });
});

test("two generated service-token secrets, retained", () => {
  template.resourceCountIs("AWS::SecretsManager::Secret", 2);
  template.hasResourceProperties("AWS::SecretsManager::Secret", { Name: "alchemy/test/read-token", GenerateSecretString: Match.objectLike({ PasswordLength: 48, ExcludePunctuation: true }) });
  template.hasResourceProperties("AWS::SecretsManager::Secret", { Name: "alchemy/test/publish-token" });
  template.hasResource("AWS::SecretsManager::Secret", { DeletionPolicy: "Retain" });
});

test("stack outputs the values the platform and CLI need", () => {
  for (const o of ["ApiUrl", "BucketName", "TableName", "ReadTokenSecretArn", "PublishTokenSecretArn"]) template.hasOutput(o, {});
});
