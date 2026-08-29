/**
 * Fastify plugin exposing a `requireServiceAuth` preHandler. Routes opt in:
 *
 *   app.get("/v1/whoami", { preHandler: [app.requireServiceAuth] }, handler)
 *
 * /health does NOT opt in — it's the only unauthenticated route.
 *
 * On success, `request.serviceAuth` is set to { sub } for handlers to read.
 */
import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from "fastify";
import { JwtVerifier, bearerFromHeader } from "./jwt.js";
import type { ServiceAuth } from "./jwt.js";

declare module "fastify" {
  interface FastifyInstance {
    requireServiceAuth: preHandlerHookHandler;
  }
  interface FastifyRequest {
    serviceAuth?: ServiceAuth;
  }
}

export interface AuthPluginOptions {
  verifier: JwtVerifier;
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  const { verifier } = opts;

  const requireServiceAuth: preHandlerHookHandler = async (request: FastifyRequest) => {
    const token = bearerFromHeader(request.headers.authorization);
    // verifier.verify throws ServiceError(unauthorized) on any failure; the
    // registered error handler renders the envelope.
    request.serviceAuth = await verifier.verify(token);
  };

  app.decorate("requireServiceAuth", requireServiceAuth);
};

export default fp(authPlugin, { name: "service-auth" });
