/**
 * POST /v1/artifacts/sign (astra -> alchemy) — contract §7bis, OQ-6 proxied
 * signing, CD-7.
 *
 * astra never reads alchemy's S3 cross-account; it calls this and gets a
 * short-lived HTTPS GET URL, or `artifact_expired` if a scratch object aged
 * out under the AL7 lifecycle policy.
 */
import type { FastifyPluginAsync } from "fastify";
import { ServiceError, validationFailed, unauthorized, notConfigured } from "../errors/envelope.js";
import { parseArtifactPointer } from "./pointer.js";
import { contentTypeForKey } from "./content-type.js";
import { S3ArtifactSigner, S3HeadError, type ArtifactSigner } from "./s3-signer.js";
import type { GenerationConfigLoader } from "../config.js";

const DEFAULT_TTL_SEC = 900; // 15 min (CD-7)
const MIN_TTL_SEC = 60;
const MAX_TTL_SEC = 3600;

function resolveTtlSeconds(): number {
  const raw = process.env.ALCHEMY_SIGNED_URL_TTL_SEC;
  if (!raw) return DEFAULT_TTL_SEC;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return DEFAULT_TTL_SEC;
  return Math.min(MAX_TTL_SEC, Math.max(MIN_TTL_SEC, n));
}

export interface SignRouteOptions {
  /** Reuses the AL3 generation config just for the content bucket name. */
  loadGenerationConfig: GenerationConfigLoader;
  region: string;
  /** Test seam. */
  signerOverride?: ArtifactSigner;
  bucketOverride?: string;
}

export function signRoute(opts: SignRouteOptions): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/artifacts/sign", { preHandler: [app.requireServiceAuth] }, async (request, reply) => {
      const body = request.body;
      if (typeof body !== "object" || body === null) {
        throw validationFailed("Request body must be a JSON object.");
      }
      const b = body as Record<string, unknown>;

      if (typeof b.experience_id !== "string" || !b.experience_id.trim()) {
        throw validationFailed("`experience_id` is required.");
      }
      const experienceId = b.experience_id;

      // The JWT `sub` is an experience_id (contract §2.3). astra mints a token
      // per run, so a token for run A cannot drive a sign request for run B.
      if (request.serviceAuth?.sub !== experienceId) {
        throw unauthorized();
      }

      // Resolve the bucket name (config, not hard-coded).
      let bucket = opts.bucketOverride;
      if (!bucket) {
        try {
          bucket = (await opts.loadGenerationConfig()).contentBucket;
        } catch (err) {
          throw notConfigured(err instanceof Error ? err.message : "content bucket is not configured");
        }
      }

      const pointer = parseArtifactPointer(b.s3_pointer, bucket, experienceId);

      const signer =
        opts.signerOverride ?? new S3ArtifactSigner(bucket, opts.region);

      let head;
      try {
        head = await signer.head(pointer.key);
      } catch (err) {
        if (err instanceof S3HeadError) {
          request.log.error({ err: err.cause, key: pointer.key }, "HeadObject failed (non-404)");
          throw new ServiceError("internal_error", "Could not check the artifact.");
        }
        throw err;
      }

      if (!head.exists) {
        if (pointer.retentionClass === "durable") {
          // A missing produced/ object is a bug (bad pointer, or the
          // promote-to-produced step didn't run) — NOT an expiry (CD-7).
          throw validationFailed(
            "The artifact does not exist. A produced artifact should be durable — this is not an expiry.",
          );
        }
        throw new ServiceError(
          "artifact_expired",
          "The artifact no longer exists — it has aged out under the retention policy or was never written.",
        );
      }

      const ttlSeconds = resolveTtlSeconds();
      const contentType = head.contentType ?? contentTypeForKey(pointer.key);

      let url: string;
      try {
        url = await signer.presignGet({ key: pointer.key, ttlSeconds, responseContentType: contentType });
      } catch (err) {
        request.log.error({ err, key: pointer.key }, "presign failed");
        throw new ServiceError("internal_error", "Could not sign the artifact URL.");
      }

      reply.status(200).send({
        url,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        content_type: contentType,
      });
    });
  };
}
