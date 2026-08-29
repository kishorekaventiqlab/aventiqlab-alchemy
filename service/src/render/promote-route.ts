/**
 * POST /v1/artifacts/promote — CD-18.
 *
 * astra's MarkProduced (A15) calls this after Gate 2 approves. alchemy copies
 * the winning render for (experience_id, cycle) from renders/ to the durable
 * produced/ prefix. Idempotent.
 */
import type { FastifyPluginAsync } from "fastify";
import { ServiceError, notConfigured, unauthorized, validationFailed } from "../errors/envelope.js";
import type { RenderConfigLoader } from "../config.js";
import { S3Client, HeadObjectCommand, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";

export interface PromoteS3 {
  /** highest attempt-N .mp4 key under renders/{experienceId}/cycle-{cycle}/, or null. */
  findWinningRender(experienceId: string, cycle: number): Promise<string | null>;
  exists(key: string): Promise<boolean>;
  copy(sourceKey: string, destKey: string): Promise<void>;
}

export interface PromoteRouteOptions {
  loadRenderConfig: RenderConfigLoader;
  region: string;
  override?: { s3: PromoteS3; bucket: string };
}

export function promoteRoute(opts: PromoteRouteOptions): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/artifacts/promote", { preHandler: [app.requireServiceAuth] }, async (request, reply) => {
      const body = request.body;
      if (typeof body !== "object" || body === null) {
        throw validationFailed("Request body must be a JSON object.");
      }
      const b = body as Record<string, unknown>;
      if (typeof b.experience_id !== "string" || !b.experience_id.trim()) {
        throw validationFailed("`experience_id` is required.");
      }
      if (typeof b.cycle !== "number" || !Number.isInteger(b.cycle) || b.cycle < 1) {
        throw validationFailed("`cycle` must be an integer >= 1.");
      }
      const experienceId = b.experience_id;
      const cycle = b.cycle;

      if (request.serviceAuth?.sub !== experienceId) throw unauthorized();

      const { s3, bucket } = await resolve(opts);

      const producedMp4 = `produced/${experienceId}/video.mp4`;
      const producedPoster = `produced/${experienceId}/video.poster.png`;

      // Idempotent: if produced/ already has both, return them.
      if ((await s3.exists(producedMp4)) && (await s3.exists(producedPoster))) {
        reply.status(200).send(promoteResponse(bucket, producedMp4, producedPoster));
        return;
      }

      const winningMp4 = await s3.findWinningRender(experienceId, cycle);
      if (!winningMp4) {
        // A missing render is a bug, not an expiry (mirrors AL6 CD-7).
        throw validationFailed(
          `No rendered video found for experience ${experienceId} cycle ${cycle}.`,
        );
      }
      const winningPoster = winningMp4.replace(/\.mp4$/, ".poster.png");
      if (!(await s3.exists(winningPoster))) {
        throw validationFailed(`The winning render ${winningMp4} has no poster frame.`);
      }

      await s3.copy(winningMp4, producedMp4);
      await s3.copy(winningPoster, producedPoster);

      reply.status(200).send(promoteResponse(bucket, producedMp4, producedPoster));
    });
  };
}

function promoteResponse(bucket: string, mp4: string, poster: string) {
  return {
    produced: {
      s3_pointer: `s3://${bucket}/${mp4}`,
      poster_s3_pointer: `s3://${bucket}/${poster}`,
    },
  };
}

async function resolve(opts: PromoteRouteOptions): Promise<{ s3: PromoteS3; bucket: string }> {
  if (opts.override) return opts.override;
  let cfg;
  try {
    cfg = await opts.loadRenderConfig();
  } catch (err) {
    throw notConfigured(err instanceof Error ? err.message : "promote is not configured");
  }
  return { s3: new AwsPromoteS3(cfg.contentBucket, opts.region), bucket: cfg.contentBucket };
}

class AwsPromoteS3 implements PromoteS3 {
  readonly #s3: S3Client;
  readonly #bucket: string;
  constructor(bucket: string, region: string, s3?: S3Client) {
    this.#bucket = bucket;
    this.#s3 = s3 ?? new S3Client({ region });
  }

  async findWinningRender(experienceId: string, cycle: number): Promise<string | null> {
    const prefix = `renders/${experienceId}/cycle-${cycle}/`;
    const res = await this.#s3.send(
      new ListObjectsV2Command({ Bucket: this.#bucket, Prefix: prefix }),
    );
    const mp4s = (res.Contents ?? [])
      .map((o) => o.Key ?? "")
      .filter((k) => /\/attempt-\d+\.mp4$/.test(k));
    if (mp4s.length === 0) return null;
    // highest attempt-N
    mp4s.sort((a, z) => attemptNum(z) - attemptNum(a));
    return mp4s[0]!;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.#s3.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }));
      return true;
    } catch (err) {
      const name = (err as { name?: string }).name;
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (name === "NotFound" || name === "NoSuchKey" || status === 404) return false;
      throw err;
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    await this.#s3.send(
      new CopyObjectCommand({
        Bucket: this.#bucket,
        CopySource: `${this.#bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, "/")}`,
        Key: destKey,
      }),
    );
  }
}

function attemptNum(key: string): number {
  const m = /\/attempt-(\d+)\.mp4$/.exec(key);
  return m ? Number.parseInt(m[1]!, 10) : 0;
}
