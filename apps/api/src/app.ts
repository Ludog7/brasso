import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import { healthRoutes } from "./modules/health/routes.js";
import configPlugin from "./plugins/config.js";
import errorHandler from "./plugins/errorHandler.js";

export interface BuildAppOptions {
  /** Config injectée (tests) ; sinon chargée depuis l'environnement. */
  config?: AppConfig;
}

/**
 * Construit l'instance Fastify sans l'écouter — testable via `app.inject`
 * (séparation app/server, SPEC M0-05). Auth (M0-06) et RBAC (M0-07) viendront
 * s'enregistrer ici.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  // Ordre : config d'abord (les autres plugins en dépendent), puis sécurité,
  // gestion d'erreurs, enfin les modules.
  await app.register(configPlugin, { config: opts.config });
  await app.register(sensible);
  await app.register(helmet);
  await app.register(cors, { origin: false });
  await app.register(errorHandler);

  await app.register(healthRoutes);

  return app;
}
