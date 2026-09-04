/**
 * The render worker's write-only view of the job record (DynamoDB
 * `alchemy-render-jobs`). The worker only ever UpdateItems its own job.
 */
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

export interface JobPatch {
  status?: 'running' | 'done' | 'failed';
  phase?: 'synthesizing' | 'rendering' | 'validating' | null;
  mechanical_qa?: unknown;
  visual_qa?: unknown;
  output?: unknown;
  rendered_spec_pointer?: string;
  error?: { code: string; message: string; retryable: boolean };
  started_at?: string;
  finished_at?: string;
}

export class DynamoRenderJobUpdater {
  readonly #db: DynamoDBClient;
  readonly #table: string;

  constructor(table: string, region: string, db?: DynamoDBClient) {
    this.#db = db ?? new DynamoDBClient({ region });
    this.#table = table;
  }

  async patch(renderJobId: string, patch: JobPatch): Promise<void> {
    const now = new Date().toISOString();
    const sets = ['updated_at = :updated_at'];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = { ':updated_at': now };

    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      names[`#${key}`] = key;
      values[`:${key}`] = val;
      sets.push(`#${key} = :${key}`);
    }

    await this.#db.send(
      new UpdateItemCommand({
        TableName: this.#table,
        Key: marshall({ render_job_id: renderJobId }),
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: marshall(values, { removeUndefinedValues: true }),
      }),
    );
  }
}
