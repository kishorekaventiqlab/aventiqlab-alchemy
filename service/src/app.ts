/**
 * buildApp() — constructs the Fastify instance with auth, the error envelope,
 * and the routes, but does NOT call .listen(). Shared by:
 *   - server.ts   (local: buildApp().listen())
 *   - lambda.ts    (AWS: awsLambdaFastify(buildApp()))
 *
 * AL2 scope: /health (unauthed) + /v1/whoami (authed stub). AL3/AL5/AL6 register
 * their routes here too.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { buildConfig, type ServiceConfig } from "./config.js";
import { registerErrorEnvelope } from "./errors/envelope.js";
import authPlugin from "./auth/plugin.js";
import { jwtVerifierFromConfig } from "./auth/jwt.js";
import { healthRoute } from "./routes/health.js";
import { whoamiRoute } from "./routes/whoami.js";
import { generateRoute } from "./generate/route.js";
import type { GeneratorDeps } from "./generate/generator.js";
import { signRoute } from "./artifacts/sign-route.js";
import type { ArtifactSigner } from "./artifacts/s3-signer.js";
import { renderRoute } from "./render/route.js";
import { promoteRoute } from "./render/promote-route.js";
import type { RenderJobStore } from "./render/job-store.js";
import type { RenderLauncher } from "./render/launcher.js";
import type { PromoteS3 } from "./render/promote-route.js";

export interface BuildAppOptions {
  /** Inject a pre-resolved config (tests). If omitted, buildConfig() runs. */
  config?: ServiceConfig;
  /** Test seam for POST /v1/generate — inject the generator deps directly. */
  generateDepsOverride?: GeneratorDeps;
  /** Test seam for POST /v1/artifacts/sign — inject the S3 signer + bucket. */
  signOverride?: { signer: ArtifactSigner; bucket: string };
  /** Test seam for POST/GET /v1/render — inject the job store + task launcher. */
  renderOverride?: { store: RenderJobStore; launcher: RenderLauncher };
  /** Test seam for POST /v1/artifacts/promote. */
  promoteOverride?: { s3: PromoteS3; bucket: string };
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? (await buildConfig());

  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ["req.headers.authorization"],
    },
    trustProxy: true,
  });

  registerErrorEnvelope(app);

  await app.register(authPlugin, { verifier: jwtVerifierFromConfig(config) });

  await app.register(healthRoute);
  await app.register(whoamiRoute);
  await app.register(
    generateRoute({
      loadGenerationConfig: config.generation,
      region: config.region,
      depsOverride: opts.generateDepsOverride,
    }),
  );
  await app.register(
    signRoute({
      loadGenerationConfig: config.generation,
      region: config.region,
      signerOverride: opts.signOverride?.signer,
      bucketOverride: opts.signOverride?.bucket,
    }),
  );
  await app.register(
    renderRoute({
      loadRenderConfig: config.render,
      region: config.region,
      override: opts.renderOverride,
    }),
  );
  await app.register(
    promoteRoute({
      loadRenderConfig: config.render,
      region: config.region,
      override: opts.promoteOverride,
    }),
  );

  return app;
}
