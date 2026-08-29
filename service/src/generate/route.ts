/**
 * POST /v1/generate (astra -> alchemy) — one artifact's content.
 * Contract §7.1 / §7.2. Behind requireServiceAuth.
 *
 * AL3 scope: material, quiz, source_code_lab, skill_evaluator.
 * `video` -> unsupported_type until AL8.
 */
import type { FastifyPluginAsync } from "fastify";
import { notConfigured } from "../errors/envelope.js";
import { validateGenerateRequest } from "./validate-request.js";
import { generateArtifact } from "./generator.js";
import { OpenRouterClient } from "./openrouter.js";
import { S3ArtifactStore } from "./store.js";
import type { GeneratorDeps } from "./generator.js";
import type { GenerationConfigLoader } from "../config.js";

export interface GenerateRouteOptions {
  loadGenerationConfig: GenerationConfigLoader;
  region: string;
  /** Test seam: inject the deps instead of building them from config. */
  depsOverride?: GeneratorDeps;
}

export function generateRoute(opts: GenerateRouteOptions): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/generate", { preHandler: [app.requireServiceAuth] }, async (request, reply) => {
      const { req, type } = validateGenerateRequest(request.body);

      let deps = opts.depsOverride;
      if (!deps) {
        let cfg;
        try {
          cfg = await opts.loadGenerationConfig();
        } catch (err) {
          // config.ts throws ConfigError (code not_configured) — normalise.
          throw notConfigured(
            err instanceof Error ? err.message : "generation is not configured",
          );
        }
        deps = {
          model: new OpenRouterClient(cfg),
          store: new S3ArtifactStore(cfg.contentBucket, opts.region),
          modelByType: cfg.modelByType,
          defaultModel: cfg.defaultModel,
          log: request.log,
        };
      }

      const result = await generateArtifact(req, type, { ...deps, log: request.log });
      reply.status(200).send(result);
    });
  };
}
