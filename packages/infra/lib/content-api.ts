/**
 * REST API Gateway + two Lambdas + two service-token secrets.
 *
 *   GET  /health                       open
 *   ANY  /{proxy+}                     Lambda REQUEST authorizer (bearer token) -> API Lambda
 *
 * Read token  -> scope "read"    (GET routes only; handed to the AventiqLab platform)
 * Publish token -> scope "publish" (all routes; handed to the publishing CLI)
 */
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  AccessLogFormat,
  AuthorizationType,
  EndpointType,
  IdentitySource,
  LambdaIntegration,
  LogGroupLogDestination,
  MethodLoggingLevel,
  RequestAuthorizer,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import type { ITable } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { IBucket } from "aws-cdk-lib/aws-s3";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../api/src");

export interface ContentApiProps {
  stage: string;
  table: ITable;
  bucket: IBucket;
}

export class ContentApi extends Construct {
  readonly api: RestApi;
  readonly readTokenSecret: Secret;
  readonly publishTokenSecret: Secret;

  constructor(scope: Construct, id: string, props: ContentApiProps) {
    super(scope, id);
    const stack = Stack.of(this);

    /* ------------------------------------------------------------ secrets */
    const tokenSecret = (name: string, description: string) =>
      new Secret(this, name, {
        secretName: `alchemy/${props.stage}/${name}`,
        description,
        generateSecretString: { passwordLength: 48, excludePunctuation: true, includeSpace: false },
        removalPolicy: RemovalPolicy.RETAIN,
      });
    this.readTokenSecret = tokenSecret("read-token", "Alchemy READ service token. Copy into the AventiqLab platform account's Secrets Manager.");
    this.publishTokenSecret = tokenSecret("publish-token", "Alchemy PUBLISH service token. Used by the alchemy CLI only.");

    /* ------------------------------------------------------------ lambdas */
    const bundling = {
      format: OutputFormat.CJS,
      target: "node22",
      minify: false,
      sourceMap: true,
      externalModules: [] as string[], // bundle the SDK: deterministic versions across deploys
    };
    const logGroup = (name: string) =>
      new LogGroup(this, `${name}Logs`, { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY });

    const authorizerFn = new NodejsFunction(this, "AuthorizerFn", {
      functionName: `alchemy-${props.stage}-authorizer`,
      entry: path.join(API_SRC, "authorizer.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      logGroup: logGroup("Authorizer"),
      bundling,
      environment: {
        ALCHEMY_READ_TOKEN_SECRET_ARN: this.readTokenSecret.secretArn,
        ALCHEMY_PUBLISH_TOKEN_SECRET_ARN: this.publishTokenSecret.secretArn,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    this.readTokenSecret.grantRead(authorizerFn);
    this.publishTokenSecret.grantRead(authorizerFn);

    const apiFn = new NodejsFunction(this, "ApiFn", {
      functionName: `alchemy-${props.stage}-api`,
      entry: path.join(API_SRC, "handler.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(29), // API Gateway REST integration ceiling
      logGroup: logGroup("Api"),
      bundling,
      environment: {
        ALCHEMY_TABLE_NAME: props.table.tableName,
        ALCHEMY_BUCKET_NAME: props.bucket.bucketName,
        ALCHEMY_SIGNED_URL_TTL_SEC: "900",
        ALCHEMY_UPLOAD_URL_TTL_SEC: "3600",
        ALCHEMY_VERIFY_HASH_MAX_BYTES: String(32 * 1024 * 1024),
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    // Least privilege, spelled out rather than grantReadWriteData (which adds Scan/UpdateItem/etc.).
    apiFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem", "dynamodb:ConditionCheckItem"],
        resources: [props.table.tableArn, `${props.table.tableArn}/index/*`],
      }),
    );
    apiFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [props.bucket.arnForObjects("*")],
      }),
    );

    /* ---------------------------------------------------------------- api */
    const accessLogs = new LogGroup(this, "ApiAccessLogs", { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY });
    this.api = new RestApi(this, "RestApi", {
      restApiName: `alchemy-${props.stage}`,
      description: "Alchemy content delivery + publishing API",
      endpointTypes: [EndpointType.REGIONAL],
      deployOptions: {
        stageName: "v1",
        accessLogDestination: new LogGroupLogDestination(accessLogs),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: MethodLoggingLevel.ERROR,
        metricsEnabled: true,
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
      },
      binaryMediaTypes: [],
      cloudWatchRole: true,
    });

    const authorizer = new RequestAuthorizer(this, "TokenAuthorizer", {
      authorizerName: `alchemy-${props.stage}-token`,
      handler: authorizerFn,
      identitySources: [IdentitySource.header("Authorization")],
      resultsCacheTtl: Duration.minutes(5),
    });

    const integration = new LambdaIntegration(apiFn, { proxy: true });
    this.api.root.addResource("health").addMethod("GET", integration, { authorizationType: AuthorizationType.NONE });
    this.api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
      defaultMethodOptions: { authorizer, authorizationType: AuthorizationType.CUSTOM },
    });

    // Belt and braces: the authorizer's policy already scopes read tokens to GET.
    void stack;
  }
}
