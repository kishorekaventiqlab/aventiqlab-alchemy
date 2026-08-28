/**
 * GET /v1/whoami — authenticated stub. Proves the full auth path end to end:
 * a valid astra -> alchemy service token in, the token's `sub` (an
 * experience_id) back out. Removed or repurposed once real endpoints
 * (AL3 /v1/generate, AL5 /v1/render, AL6 /v1/artifacts/sign) exist.
 */
import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../errors/envelope.js";

export const whoamiRoute: FastifyPluginAsync = async (app) => {
  app.get("/v1/whoami", { preHandler: [app.requireServiceAuth] }, async (request) => {
    const auth = request.serviceAuth;
    if (!auth) throw unauthorized(); // preHandler guarantees this, belt-and-braces
    return { sub: auth.sub };
  });
};
