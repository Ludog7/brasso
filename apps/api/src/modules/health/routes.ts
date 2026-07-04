import type { FastifyPluginAsync } from "fastify";

/**
 * Module `health` — sonde de vivacité. Sert de cible au healthcheck Docker
 * (M0-03) et de smoke-test de la stack Fastify.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ status: "ok" as const }));
};
