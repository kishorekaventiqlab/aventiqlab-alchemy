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

export interface BuildAppOptions {
  /** Inject a pre-resolved config (tests). If omitted, buildConfig() runs. */
  config?: ServiceConfig;
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

  return app;
}
