/**
 * POST /v1/render (async — 202 + job record + ecs:RunTask) and
 * GET /v1/render/{render_job_id} (poll) — contract §7.4 / §7.5, CD-17.
 *
 * Both on the AL2 Lambda. The Lambda never renders — it does RunTask + job
 * I/O only. The one-shot Fargate worker (src/render/worker.ts) does the work.
 */
import type { FastifyPluginAsync } from "fastify";
import { ServiceError, notConfigured, unauthorized, validationFailed } from "../errors/envelope.js";
import { validateRenderRequest } from "./validate-request.js";
import { planReRender } from "./plan-rerender.js";
import { renderJobId } from "./id.js";
import { jobToView, type RenderJob } from "./types.js";
import { RenderInProgressError, type RenderJobStore, DynamoRenderJobStore } from "./job-store.js";
import { EcsS3RenderLauncher, type RenderLauncher } from "./launcher.js";
import type { RenderConfigLoader } from "../config.js";

export interface RenderRouteOptions {
  loadRenderConfig: RenderConfigLoader;
  region: string;
  /** Test seam. */
  override?: { store: RenderJobStore; launcher: RenderLauncher };
}

export function renderRoute(opts: RenderRouteOptions): FastifyPluginAsync {
  return async (app) => {
    // ---- POST /v1/render ------------------------------------------------
    app.post("/v1/render", { preHandler: [app.requireServiceAuth] }, async (request, reply) => {
      const req = validateRenderRequest(request.body);

      if (request.serviceAuth?.sub !== req.experience_id) {
        throw unauthorized();
      }

      // Fail fast on an unusable vision_qa_feedback (content_flaw, missing
      // beat_id on narration_flaw, etc.) BEFORE launching anything.
      planReRender(req.cycle, req.vision_qa_feedback);

      const { store, launcher } = await resolveDeps(opts);

      const id = renderJobId();
      const now = new Date().toISOString();
      const requestS3Key = await launcher.stashRequest(req, id);

      const ttlDays = 30;
      const job: RenderJob = {
        render_job_id: id,
        experience_id: req.experience_id,
        cycle: req.cycle,
        status: "pending",
        phase: null,
        request_s3_key: requestS3Key,
        created_at: now,
        updated_at: now,
        ttl: Math.floor(Date.now() / 1000) + ttlDays * 86400,
      };

      try {
        await store.create(job);
      } catch (err) {
        if (err instanceof RenderInProgressError) {
          throw new ServiceError("invalid_pipeline_state", err.message);
        }
        throw err;
      }

      try {
        await launcher.launch({ renderJobId: id, requestS3Key });
      } catch (err) {
        // The task didn't launch — mark the job failed so a poll doesn't hang.
        await store.patch(id, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: { code: "internal_error", message: "Failed to launch the render task.", retryable: true },
        });
        request.log.error({ err }, "ecs:RunTask failed");
        throw new ServiceError("internal_error", "Failed to start the render.");
      }

      reply.status(202).send({
        render_job_id: id,
        experience_id: req.experience_id,
        cycle: req.cycle,
        status: "pending",
      });
    });

    // ---- GET /v1/render/{render_job_id} -------------------------------
    app.get<{ Params: { render_job_id: string } }>(
      "/v1/render/:render_job_id",
      { preHandler: [app.requireServiceAuth] },
      async (request, reply) => {
        const { render_job_id } = request.params;
        if (!/^rj_[0-9A-HJKMNP-TV-Z]+$/.test(render_job_id)) {
          throw validationFailed("Malformed render_job_id.");
        }

        const { store } = await resolveDeps(opts);
        const job = await store.get(render_job_id);
        if (!job) {
          throw new ServiceError("render_job_not_found", "No such render job.");
        }
        if (job.experience_id !== request.serviceAuth?.sub) {
          // Don't leak existence to the wrong caller.
          throw new ServiceError("render_job_not_found", "No such render job.");
        }

        reply.status(200).send(jobToView(job));
      },
    );
  };
}

async function resolveDeps(
  opts: RenderRouteOptions,
): Promise<{ store: RenderJobStore; launcher: RenderLauncher }> {
  if (opts.override) return opts.override;
  let cfg;
  try {
    cfg = await opts.loadRenderConfig();
  } catch (err) {
    throw notConfigured(err instanceof Error ? err.message : "render is not configured");
  }
  return {
    store: new DynamoRenderJobStore(cfg.renderJobsTable, opts.region),
    launcher: new EcsS3RenderLauncher(cfg, opts.region),
  };
}
