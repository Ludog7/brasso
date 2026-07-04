import type { FastifyPluginAsync } from "fastify";

/**
 * Module `health` — sonde de vivacité. Sert de cible au healthcheck Docker
 * (M0-03) et de smoke-test de la stack Fastify.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Sonde publique : hors RBAC (opt-out explicite du deny-by-default).
  app.get("/health", { config: { rbacExempt: true } }, async () => ({ status: "ok" as const }));
};
