/**
 * Single-table DynamoDB design (docs/dynamodb-data-model.md).
 *
 *   PK / SK            one experience (or one skill) per partition
 *   GSI1PK / GSI1SK    list-by-type: EXPERIENCE|SKILL -> {domain}#{id}
 *   GSI2PK / GSI2SK    reverse lookups: SKILL#{id} -> {relation}#{experienceId}#{version}
 *                                        SKILLPARENT#{id} -> {childSkillId}
 */
import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, ProjectionType, Table, TableEncryption, type ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export interface ContentTableProps {
  tableName?: string;
}

export class ContentTable extends Construct {
  readonly table: ITable;

  constructor(scope: Construct, id: string, props: ContentTableProps = {}) {
    super(scope, id);
    const table = new Table(this, "Table", {
      tableName: props.tableName ?? "aventiqlab-alchemy-content",
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
      deletionProtection: true,
    });
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    table.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: { name: "GSI2PK", type: AttributeType.STRING },
      sortKey: { name: "GSI2SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.table = table;
  }
}
