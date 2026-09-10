import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { BaseItem } from "@aventiqlab/alchemy-core";
import { decodeCursor, encodeCursor } from "./http.js";
import { ConflictError, type ContentStore, type Key, type Page, type StatusGuard } from "./ports.js";

const BATCH = 25;

export class DynamoContentStore implements ContentStore {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client: DynamoDBClient = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  async get<T extends BaseItem>(key: Key): Promise<T | null> {
    const out = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }));
    return (out.Item as T | undefined) ?? null;
  }

  async query<T extends BaseItem>(pk: string, skPrefix?: string): Promise<T[]> {
    const items: T[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          ConsistentRead: true,
          KeyConditionExpression: skPrefix ? "PK = :pk AND begins_with(SK, :sk)" : "PK = :pk",
          ExpressionAttributeValues: skPrefix ? { ":pk": pk, ":sk": skPrefix } : { ":pk": pk },
          ExclusiveStartKey,
        }),
      );
      items.push(...((out.Items ?? []) as T[]));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  async queryIndex<T extends BaseItem>(
    index: "GSI1" | "GSI2",
    pk: string,
    opts: { skPrefix?: string; limit?: number; cursor?: string } = {},
  ): Promise<Page<T>> {
    const pkAttr = `${index}PK`;
    const skAttr = `${index}SK`;
    const out = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: index,
        KeyConditionExpression: opts.skPrefix ? "#pk = :pk AND begins_with(#sk, :sk)" : "#pk = :pk",
        ExpressionAttributeNames: opts.skPrefix ? { "#pk": pkAttr, "#sk": skAttr } : { "#pk": pkAttr },
        ExpressionAttributeValues: opts.skPrefix ? { ":pk": pk, ":sk": opts.skPrefix } : { ":pk": pk },
        Limit: opts.limit,
        ExclusiveStartKey: decodeCursor(opts.cursor),
      }),
    );
    return { items: (out.Items ?? []) as T[], cursor: encodeCursor(out.LastEvaluatedKey) };
  }

  private async batch(requests: Record<string, unknown>[]): Promise<void> {
    for (let i = 0; i < requests.length; i += BATCH) {
      let pending = requests.slice(i, i + BATCH);
      for (let attempt = 0; pending.length && attempt < 5; attempt++) {
        const out = await this.doc.send(new BatchWriteCommand({ RequestItems: { [this.tableName]: pending } }));
        pending = (out.UnprocessedItems?.[this.tableName] ?? []) as Record<string, unknown>[];
        if (pending.length) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
      }
      if (pending.length) throw new Error(`DynamoDB batch write left ${pending.length} unprocessed items`);
    }
  }

  async batchPut(items: BaseItem[]): Promise<void> {
    if (items.length) await this.batch(items.map((Item) => ({ PutRequest: { Item } })));
  }

  async batchDelete(keys: Key[]): Promise<void> {
    if (keys.length) await this.batch(keys.map((Key) => ({ DeleteRequest: { Key } })));
  }

  async transactPut(items: BaseItem[], guards: StatusGuard[] = []): Promise<void> {
    const guardFor = (i: Key) => guards.find((g) => g.PK === i.PK && g.SK === i.SK);
    const putKeys = new Set(items.map((i) => `${i.PK} ${i.SK}`));
    const TransactItems: NonNullable<TransactWriteCommandInput["TransactItems"]> = items.map((Item) => {
      const g = guardFor(Item);
      return g
        ? {
            Put: {
              TableName: this.tableName,
              Item,
              ConditionExpression: "attribute_exists(PK) AND #status = :expected",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: { ":expected": g.expectedStatus },
            },
          }
        : { Put: { TableName: this.tableName, Item } };
    });
    // Guards on items we are not writing become standalone condition checks.
    for (const g of guards) {
      if (putKeys.has(`${g.PK} ${g.SK}`)) continue;
      TransactItems.push({
        ConditionCheck: {
          TableName: this.tableName,
          Key: { PK: g.PK, SK: g.SK },
          ConditionExpression: "attribute_exists(PK) AND #status = :expected",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":expected": g.expectedStatus },
        },
      });
    }
    try {
      await this.doc.send(new TransactWriteCommand({ TransactItems }));
    } catch (e) {
      if ((e as { name?: string }).name === "TransactionCanceledException") throw new ConflictError((e as Error).message);
      throw e;
    }
  }
}
