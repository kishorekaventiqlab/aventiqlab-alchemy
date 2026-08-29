/**
 * The render-job store (DynamoDB `alchemy-render-jobs`), AL5 rev-2 plan §3.
 *
 * - PK: render_job_id (ULID)
 * - GSI: experience_id  -> the one-render-per-experience guard
 * - 30-day TTL
 *
 * The interface is the seam tests mock; `DynamoRenderJobStore` is the real one.
 */
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { RenderJob, RenderJobStatus, RenderPhase, MechanicalQa, RenderOutput } from "./types.js";

export class RenderInProgressError extends Error {
  readonly code = "invalid_pipeline_state";
  constructor(experienceId: string) {
    super(`A render is already in progress for experience ${experienceId}.`);
    this.name = "RenderInProgressError";
  }
}

export interface JobPatch {
  status?: RenderJobStatus;
  phase?: RenderPhase;
  mechanical_qa?: MechanicalQa;
  output?: RenderOutput;
  rendered_spec_pointer?: string;
  error?: { code: string; message: string; retryable: boolean };
  started_at?: string;
  finished_at?: string;
}

export interface RenderJobStore {
  /**
   * Create a job. Throws RenderInProgressError if this experience already has a
   * pending/running job.
   */
  create(job: RenderJob): Promise<void>;
  get(renderJobId: string): Promise<RenderJob | null>;
  patch(renderJobId: string, patch: JobPatch): Promise<void>;
  /** The active (pending|running) job for an experience, if any. */
  activeForExperience(experienceId: string): Promise<RenderJob | null>;
}

const ACTIVE_STATUSES: RenderJobStatus[] = ["pending", "running"];

export class DynamoRenderJobStore implements RenderJobStore {
  readonly #db: DynamoDBClient;
  readonly #table: string;
  readonly #gsi: string;

  constructor(table: string, region: string, db?: DynamoDBClient) {
    this.#db = db ?? new DynamoDBClient({ region });
    this.#table = table;
    this.#gsi = "by-experience";
  }

  async create(job: RenderJob): Promise<void> {
    const active = await this.activeForExperience(job.experience_id);
    if (active) throw new RenderInProgressError(job.experience_id);
    try {
      await this.#db.send(
        new PutItemCommand({
          TableName: this.#table,
          Item: marshall(job, { removeUndefinedValues: true }),
          ConditionExpression: "attribute_not_exists(render_job_id)",
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new RenderInProgressError(job.experience_id);
      }
      throw err;
    }
  }

  async get(renderJobId: string): Promise<RenderJob | null> {
    const res = await this.#db.send(
      new GetItemCommand({ TableName: this.#table, Key: marshall({ render_job_id: renderJobId }) }),
    );
    return res.Item ? (unmarshall(res.Item) as RenderJob) : null;
  }

  async patch(renderJobId: string, patch: JobPatch): Promise<void> {
    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = :updated_at"];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = { ":updated_at": now };

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
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: marshall(values, { removeUndefinedValues: true }),
      }),
    );
  }

  async activeForExperience(experienceId: string): Promise<RenderJob | null> {
    const res = await this.#db.send(
      new QueryCommand({
        TableName: this.#table,
        IndexName: this.#gsi,
        KeyConditionExpression: "experience_id = :eid",
        FilterExpression: "#s IN (:pending, :running)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: marshall({
          ":eid": experienceId,
          ":pending": ACTIVE_STATUSES[0],
          ":running": ACTIVE_STATUSES[1],
        }),
      }),
    );
    const items = (res.Items ?? []).map((i) => unmarshall(i) as RenderJob);
    return items[0] ?? null;
  }
}

/** In-memory store for tests. */
export class MemoryRenderJobStore implements RenderJobStore {
  readonly jobs = new Map<string, RenderJob>();

  async create(job: RenderJob): Promise<void> {
    const active = await this.activeForExperience(job.experience_id);
    if (active) throw new RenderInProgressError(job.experience_id);
    this.jobs.set(job.render_job_id, structuredClone(job));
  }
  async get(id: string): Promise<RenderJob | null> {
    const j = this.jobs.get(id);
    return j ? structuredClone(j) : null;
  }
  async patch(id: string, patch: JobPatch): Promise<void> {
    const j = this.jobs.get(id);
    if (!j) throw new Error(`no such job ${id}`);
    Object.assign(j, patch, { updated_at: new Date().toISOString() });
  }
  async activeForExperience(experienceId: string): Promise<RenderJob | null> {
    for (const j of this.jobs.values()) {
      if (j.experience_id === experienceId && ACTIVE_STATUSES.includes(j.status)) {
        return structuredClone(j);
      }
    }
    return null;
  }
}
