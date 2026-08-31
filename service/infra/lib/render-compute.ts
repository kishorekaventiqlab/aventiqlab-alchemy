/**
 * AL5 render compute (CD-17): the render-job DynamoDB table + the one-shot
 * Fargate render worker task definition + its roles.
 *
 * The task has NO inbound HTTP. The Lambda's POST /v1/render does ecs:RunTask;
 * the task reads the stashed request from S3, renders, writes the job record
 * and S3 outputs, exits.
 */
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  Table,
  ProjectionType,
  type ITable,
} from "aws-cdk-lib/aws-dynamodb";
import {
  Cluster,
  FargateTaskDefinition,
  ContainerImage,
  LogDrivers,
  CpuArchitecture,
  OperatingSystemFamily,
  type ICluster,
} from "aws-cdk-lib/aws-ecs";
import { Vpc, SubnetType, SecurityGroup, type IVpc } from "aws-cdk-lib/aws-ec2";
import { RetentionDays, LogGroup } from "aws-cdk-lib/aws-logs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import type { ContentBucket } from "./content-bucket.js";
import type { ISecret } from "aws-cdk-lib/aws-secretsmanager";

export interface RenderComputeProps {
  content: ContentBucket;
  /** The shared service secret (holds ALCHEMY_SERVICE_JWT_SECRET + OPENROUTER_API_KEY). */
  serviceSecret: ISecret;
  /** Days a render-job record lives (DynamoDB TTL). */
  jobTtlDays: number;
  /** Optionally reuse an existing VPC; otherwise a minimal one is created. */
  vpc?: IVpc;
}

export class RenderCompute extends Construct {
  readonly jobsTable: ITable;
  readonly cluster: ICluster;
  readonly taskDefinitionArn: string;
  readonly containerName = "render";
  readonly subnetIds: string[];
  readonly securityGroupIds: string[];
  readonly renderTaskRoleArn: string;

  constructor(scope: Construct, id: string, props: RenderComputeProps) {
    super(scope, id);

    // ---- job store --------------------------------------------------
    const table = new Table(this, "RenderJobs", {
      tableName: "alchemy-render-jobs",
      partitionKey: { name: "render_job_id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: "by-experience",
      partitionKey: { name: "experience_id", type: AttributeType.STRING },
      projectionType: ProjectionType.INCLUDE,
      nonKeyAttributes: ["status", "cycle", "created_at"],
    });
    this.jobsTable = table;

    // ---- network + cluster --------------------------------------
    // The AZ-availability context is pre-seeded in bin/app.ts (a real lookup
    // needs a role in alchemy's account, which this dev machine can't assume).
    const vpc =
      props.vpc ??
      new Vpc(this, "Vpc", {
        maxAzs: 2,
        natGateways: 1, // the task needs egress (OpenRouter, HuggingFace weights are baked in)
        subnetConfiguration: [
          { name: "public", subnetType: SubnetType.PUBLIC, cidrMask: 24 },
          { name: "private", subnetType: SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        ],
      });

    const cluster = new Cluster(this, "Cluster", { vpc, containerInsights: true });
    this.cluster = cluster;

    const sg = new SecurityGroup(this, "RenderTaskSg", {
      vpc,
      description: "alchemy render worker task, egress only",
      allowAllOutbound: true,
    });
    this.securityGroupIds = [sg.securityGroupId];
    this.subnetIds = vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }).subnetIds;

    // ---- the render worker task definition ---------------------
    const logGroup = new LogGroup(this, "RenderLogs", { retention: RetentionDays.ONE_MONTH });

    const taskDef = new FargateTaskDefinition(this, "RenderTaskDef", {
      cpu: 4096, // 4 vCPU
      memoryLimitMiB: 8192, // 8 GB
      // Fargate's 20 GiB default was exhausted extracting the render image
      // (10.14 GB compressed in ECR — torch/torchaudio CPU wheels + Chatterbox
      // pre-pulled weights + Remotion/Chromium; uncompressed layers exceed
      // 20 GiB) — confirmed live via a CannotPullContainerError "no space
      // left on device". 40 GiB gives comfortable headroom without
      // over-provisioning.
      ephemeralStorageGiB: 40,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.X86_64, // Chatterbox/torch CPU wheels are surest on x86_64
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    });

    taskDef.addContainer("Render", {
      containerName: this.containerName,
      // The AL9 image: video-studio + a chatterbox-tts CPU venv + pre-pulled
      // weights. Built from video-studio/Dockerfile.render (see that file).
      // platform MUST be pinned to match runtimePlatform.cpuArchitecture above
      // (X86_64) — without it, `docker buildx` defaults to the BUILD HOST's
      // native architecture (e.g. arm64 on Apple Silicon), producing an image
      // that fails at container start with "exec format error" on the
      // x86_64 Fargate runtime. Confirmed live: this broke every real
      // /v1/render call until this fix (first real end-to-end render attempt).
      image: ContainerImage.fromAsset("../../video-studio", {
        file: "Dockerfile.render",
        platform: Platform.LINUX_AMD64,
      }),
      logging: LogDrivers.awsLogs({ streamPrefix: "render", logGroup }),
      environment: {
        NODE_ENV: "production",
        ALCHEMY_CONTENT_BUCKET: props.content.bucket.bucketName,
        ALCHEMY_RENDER_JOBS_TABLE: table.tableName,
        CHATTERBOX_DEVICE: "cpu",
      },
      secrets: {
        // OPENROUTER_API_KEY for the narration_flaw single-beat regen.
        // (The task never needs ALCHEMY_SERVICE_JWT_SECRET — it has no HTTP surface.)
      },
    });

    // The task can read the OpenRouter key from Secrets Manager at runtime.
    props.serviceSecret.grantRead(taskDef.taskRole);

    // ---- task role IAM (AL5 §10) -------------------------------
    props.content.grantRendersWrite(taskDef.taskRole);
    props.content.grantRendersRead(taskDef.taskRole);
    props.content.grantProducedWrite(taskDef.taskRole); // for a future in-task promote; harmless
    props.content.grantTtsCache(taskDef.taskRole);
    table.grant(taskDef.taskRole, "dynamodb:UpdateItem");

    this.taskDefinitionArn = taskDef.taskDefinitionArn;
    this.renderTaskRoleArn = taskDef.taskRole.roleArn;

    // Expose the RunTask permission statement for the Lambda role.
    this.runTaskStatement = new PolicyStatement({
      actions: ["ecs:RunTask"],
      resources: [taskDef.taskDefinitionArn],
      conditions: { ArnEquals: { "ecs:cluster": cluster.clusterArn } },
    });
    this.passRoleStatement = new PolicyStatement({
      actions: ["iam:PassRole"],
      resources: [taskDef.taskRole.roleArn, taskDef.executionRole!.roleArn],
    });
  }

  readonly runTaskStatement: PolicyStatement;
  readonly passRoleStatement: PolicyStatement;

  /** Grant the Lambda the DynamoDB access it needs for POST/GET /v1/render. */
  grantLambdaJobAccess(grantee: import("aws-cdk-lib/aws-iam").IGrantable): void {
    this.jobsTable.grant(grantee, "dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query");
  }
}
