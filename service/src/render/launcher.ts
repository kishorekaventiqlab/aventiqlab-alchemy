/**
 * Launches the one-shot Fargate render worker (AL5 rev-2 plan §2).
 *
 * The Lambda's POST /v1/render:
 *   1. stashes the request body (incl. video_spec — too big for a task env var)
 *      to S3 at renders/{experience_id}/cycle-{cycle}/request.json
 *   2. ecs:RunTask with the render_job_id + the request S3 key as container
 *      env overrides
 *
 * The seam is mocked in tests; `EcsS3RenderLauncher` is the real one.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import type { RenderConfig } from "../config.js";
import type { RenderRequest } from "./types.js";

export interface RenderLauncher {
  /** Stash the request in S3, return its key. */
  stashRequest(req: RenderRequest, renderJobId: string): Promise<string>;
  /** Launch the worker task for a job. */
  launch(params: { renderJobId: string; requestS3Key: string }): Promise<void>;
}

function requestKey(experienceId: string, cycle: number): string {
  return `renders/${experienceId}/cycle-${cycle}/request.json`;
}

export { requestKey };

export class EcsS3RenderLauncher implements RenderLauncher {
  readonly #s3: S3Client;
  readonly #ecs: ECSClient;
  readonly #cfg: RenderConfig;

  constructor(cfg: RenderConfig, region: string, deps?: { s3?: S3Client; ecs?: ECSClient }) {
    this.#cfg = cfg;
    this.#s3 = deps?.s3 ?? new S3Client({ region });
    this.#ecs = deps?.ecs ?? new ECSClient({ region });
  }

  async stashRequest(req: RenderRequest, renderJobId: string): Promise<string> {
    const key = requestKey(req.experience_id, req.cycle);
    await this.#s3.send(
      new PutObjectCommand({
        Bucket: this.#cfg.contentBucket,
        Key: key,
        Body: JSON.stringify({ ...req, render_job_id: renderJobId }, null, 2),
        ContentType: "application/json",
      }),
    );
    return key;
  }

  async launch(params: { renderJobId: string; requestS3Key: string }): Promise<void> {
    await this.#ecs.send(
      new RunTaskCommand({
        cluster: this.#cfg.ecsCluster,
        taskDefinition: this.#cfg.renderTaskDefinition,
        launchType: "FARGATE",
        count: 1,
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: this.#cfg.subnets,
            securityGroups: this.#cfg.securityGroups,
            assignPublicIp: "DISABLED",
          },
        },
        overrides: {
          containerOverrides: [
            {
              name: this.#cfg.renderContainerName,
              environment: [
                { name: "RENDER_JOB_ID", value: params.renderJobId },
                { name: "RENDER_REQUEST_S3_KEY", value: params.requestS3Key },
                { name: "ALCHEMY_CONTENT_BUCKET", value: this.#cfg.contentBucket },
                { name: "ALCHEMY_RENDER_JOBS_TABLE", value: this.#cfg.renderJobsTable },
              ],
            },
          ],
        },
      }),
    );
  }
}
