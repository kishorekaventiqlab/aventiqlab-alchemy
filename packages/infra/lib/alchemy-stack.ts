/**
 * One stack, four resource groups, nothing else:
 *   ContentBucket  — S3, the canonical artifact store
 *   ContentTable   — DynamoDB single table
 *   ContentApi     — API Gateway REST + authorizer Lambda + API Lambda + 2 token secrets
 *   (CloudWatch log groups for each of the above)
 *
 * No ECS/EKS/RDS/OpenSearch/Step Functions/EventBridge/AppSync/CloudFront/Bedrock/Cognito.
 */
import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ContentApi } from "./content-api.js";
import { ContentBucket } from "./content-bucket.js";
import { ContentTable } from "./content-table.js";

export interface AlchemyStackProps extends StackProps {
  stage: string;
  allowedOrigins: string[];
}

export class AlchemyStack extends Stack {
  constructor(scope: Construct, id: string, props: AlchemyStackProps) {
    super(scope, id, props);

    const { bucket } = new ContentBucket(this, "Content", { allowedOrigins: props.allowedOrigins });
    const { table } = new ContentTable(this, "Catalog");
    const api = new ContentApi(this, "Api", { stage: props.stage, table, bucket });

    new CfnOutput(this, "ApiUrl", { value: api.api.url, description: "Base URL for ALCHEMY_API_URL" });
    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "ReadTokenSecretArn", { value: api.readTokenSecret.secretArn, description: "Copy this secret's value to the AventiqLab platform" });
    new CfnOutput(this, "PublishTokenSecretArn", { value: api.publishTokenSecret.secretArn, description: "ALCHEMY_PUBLISH_TOKEN for the CLI" });
  }
}
