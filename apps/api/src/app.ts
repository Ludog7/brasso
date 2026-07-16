import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import type { AuditRepository } from "./modules/audit/repository.js";
import { auditRoutes } from "./modules/audit/routes.js";
import type { AuthRepository } from "./modules/auth/repository.js";
import { authRoutes } from "./modules/auth/routes.js";
import type { DayRepository } from "./modules/batches/day.repository.js";
import { batchDayRoutes } from "./modules/batches/day.routes.js";
import type { BatchRepository } from "./modules/batches/repository.js";
import { batchesRoutes } from "./modules/batches/routes.js";
import type { EquipmentRepository } from "./modules/equipment/repository.js";
import { equipmentRoutes } from "./modules/equipment/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import type { MemberRepository } from "./modules/members/repository.js";
import { membersRoutes } from "./modules/members/routes.js";
import type { RecipeRepository } from "./modules/recipes/repository.js";
import { recipesRoutes } from "./modules/recipes/routes.js";
import type { CatalogRepository } from "./modules/referentials/repository.js";
import { referentialsRoutes } from "./modules/referentials/routes.js";
import type { StockRepository } from "./modules/stock/repository.js";
import { stockRoutes } from "./modules/stock/routes.js";
import type { WebhookRepository } from "./modules/webhooks/repository.js";
import { webhooksRoutes } from "./modules/webhooks/routes.js";
import type { SecretResolver } from "./modules/webhooks/service.js";
import authPlugin from "./plugins/auth.js";
import configPlugin from "./plugins/config.js";
import errorHandler from "./plugins/errorHandler.js";
import rbacPlugin from "./plugins/rbac.js";

export interface BuildAppOptions {
  /** Config injectée (tests) ; sinon chargée depuis l'environnement. */
  config?: AppConfig;
  /** Repository d'auth injecté (tests) ; sinon adossé à Prisma. */
  authRepository?: AuthRepository;
  /** Repository de recettes injecté (tests) ; sinon adossé à Prisma. */
  recipeRepository?: RecipeRepository;
  /** Repository de profils d'équipement injecté (tests) ; sinon adossé à Prisma. */
  equipmentRepository?: EquipmentRepository;
  /** Repository de batchs injecté (tests) ; sinon adossé à Prisma. */
  batchRepository?: BatchRepository;
  /** Repository de session Jour J injecté (tests) ; sinon adossé à Prisma. */
  dayRepository?: DayRepository;
  /** Repository de catalogue injecté (tests) ; sinon adossé à Prisma. */
  catalogRepository?: CatalogRepository;
  /** Repository de stock injecté (tests) ; sinon adossé à Prisma. */
  stockRepository?: StockRepository;
  /** Repository du journal d'audit injecté (tests) ; sinon adossé à Prisma. */
  auditRepository?: AuditRepository;
  /** Repository membres injecté (tests) ; sinon adossé à Prisma. */
  memberRepository?: MemberRepository;
  /** Repository webhooks injecté (tests) ; sinon adossé à Prisma. */
  webhookRepository?: WebhookRepository;
  /** Résolveur de secret webhook injecté (tests) ; sinon lecture de `process.env`. */
  webhookSecretResolver?: SecretResolver;
}

/**
 * Construit l'instance Fastify sans l'écouter — testable via `app.inject`
 * (séparation app/server, SPEC M0-05).
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
  // RBAC après l'auth (en dépend) et AVANT les modules : son hook `onRoute`
  // n'arme le deny-by-default que sur les routes enregistrées ensuite.
  await app.register(rbacPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(recipesRoutes, { prefix: "/api", repository: opts.recipeRepository });
  await app.register(equipmentRoutes, { prefix: "/api", repository: opts.equipmentRepository });
  await app.register(batchesRoutes, {
    prefix: "/api",
    repository: opts.batchRepository,
    recipeRepository: opts.recipeRepository,
  });
  await app.register(batchDayRoutes, { prefix: "/api", dayRepository: opts.dayRepository });
  await app.register(referentialsRoutes, {
    prefix: "/api",
    catalogRepository: opts.catalogRepository,
  });
  await app.register(stockRoutes, { prefix: "/api", repository: opts.stockRepository });

  // Journal d'audit (M6-03) : consommé par les modules membres/RGPD/rapprochement
  // (via `AuditService.record`) pour tracer les actions sensibles.
  await app.register(auditRoutes, { prefix: "/api", repository: opts.auditRepository });
  // Fichier membres (M6-04) : partage le même repository d'audit.
  await app.register(membersRoutes, {
    prefix: "/api",
    repository: opts.memberRepository,
    auditRepository: opts.auditRepository,
  });

  // Webhooks (M6-07) : route PUBLIQUE (signature = auth), hors préfixe `/api`
  // comme /health et /auth. Fondation générique réutilisée par M7.
  await app.register(webhooksRoutes, {
    repository: opts.webhookRepository,
    secretResolver: opts.webhookSecretResolver,
  });

  return app;
}
