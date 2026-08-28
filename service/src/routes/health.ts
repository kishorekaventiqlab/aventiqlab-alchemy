/**
 * GET /health — liveness check. No auth. Mirrors astra's `GET /health`
 * (aventiqlab-integration.md) and the contract's implicit health expectation.
 */
import type { FastifyPluginAsync } from "fastify";

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return { status: "ok" };
  });
};
