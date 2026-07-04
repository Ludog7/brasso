import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import type { AuthRepository } from "./modules/auth/repository.js";
import { authRoutes } from "./modules/auth/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import authPlugin from "./plugins/auth.js";
import configPlugin from "./plugins/config.js";
import errorHandler from "./plugins/errorHandler.js";

export interface BuildAppOptions {
  /** Config injectée (tests) ; sinon chargée depuis l'environnement. */
  config?: AppConfig;
  /** Repository d'auth injecté (tests) ; sinon adossé à Prisma. */
  authRepository?: AuthRepository;
}

/**
 * Construit l'instance Fastify sans l'écouter — testable via `app.inject`
 * (séparation app/server, SPEC M0-05). RBAC (M0-07) viendra s'enregistrer ici.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  // Ordre : config d'abord (les autres en dépendent), puis sécurité, rate-limit,
  // gestion d'erreurs, auth, enfin les modules.
  await app.register(configPlugin, { config: opts.config });
  await app.register(sensible);
  await app.register(helmet);
  await app.register(cors, { origin: false });
  // Rate-limit désactivé par défaut : activé explicitement par route (login).
  await app.register(rateLimit, { global: false });
  await app.register(errorHandler);
  await app.register(authPlugin, { repository: opts.authRepository });

  await app.register(healthRoutes);
  await app.register(authRoutes);

  return app;
}
