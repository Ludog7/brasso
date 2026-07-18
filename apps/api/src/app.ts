import { prisma } from "@brasso/db";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import type { AlertRepository } from "./modules/alerts/repository.js";
import { PrismaAlertRepository } from "./modules/alerts/repository.js";
import { alertsRoutes } from "./modules/alerts/routes.js";
import { AlertService } from "./modules/alerts/service.js";
import type { AuditRepository } from "./modules/audit/repository.js";
import { PrismaAuditRepository } from "./modules/audit/repository.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { AuditService } from "./modules/audit/service.js";
import type { AuthRepository } from "./modules/auth/repository.js";
import { authRoutes } from "./modules/auth/routes.js";
import type { BatchCycleRepository } from "./modules/batches/cycle.repository.js";
import { batchCycleRoutes } from "./modules/batches/cycle.routes.js";
import type { DayRepository } from "./modules/batches/day.repository.js";
import { batchDayRoutes } from "./modules/batches/day.routes.js";
import type { PackagingRepository } from "./modules/batches/packaging.repository.js";
import { batchPackagingRoutes } from "./modules/batches/packaging.routes.js";
import type { BatchRepository } from "./modules/batches/repository.js";
import { batchesRoutes } from "./modules/batches/routes.js";
import type { DisplayRepository } from "./modules/display/repository.js";
import { displayRoutes } from "./modules/display/routes.js";
import type { EquipmentRepository } from "./modules/equipment/repository.js";
import { equipmentRoutes } from "./modules/equipment/routes.js";
import type { ExportRepository } from "./modules/exports/repository.js";
import { exportsRoutes } from "./modules/exports/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import type { MappingRepository } from "./modules/mapping/repository.js";
import { mappingRoutes } from "./modules/mapping/routes.js";
import type { MemberRepository } from "./modules/members/repository.js";
import { membersRoutes } from "./modules/members/routes.js";
import type { RecipeRepository } from "./modules/recipes/repository.js";
import { recipesRoutes } from "./modules/recipes/routes.js";
import type { ReconciliationRepository } from "./modules/reconciliation/repository.js";
import { PrismaReconciliationRepository } from "./modules/reconciliation/repository.js";
import { reconciliationRoutes } from "./modules/reconciliation/routes.js";
import { ReconciliationService } from "./modules/reconciliation/service.js";
import type { CatalogRepository } from "./modules/referentials/repository.js";
import { referentialsRoutes } from "./modules/referentials/routes.js";
import type { StockRepository } from "./modules/stock/repository.js";
import { stockRoutes } from "./modules/stock/routes.js";
import type { TransactionRepository } from "./modules/transactions/repository.js";
import { PrismaTransactionRepository } from "./modules/transactions/repository.js";
import { transactionsRoutes } from "./modules/transactions/routes.js";
import { TransactionService } from "./modules/transactions/service.js";
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
  /** Repository du cycle post-Jour J injecté (tests) ; sinon adossé à Prisma. */
  cycleRepository?: BatchCycleRepository;
  /** Repository de conditionnement injecté (tests) ; sinon adossé à Prisma. */
  packagingRepository?: PackagingRepository;
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
  /** Repository transactions/rapprochement injecté (tests) ; sinon adossé à Prisma. */
  transactionRepository?: TransactionRepository;
  /** Repository mapping SKU injecté (tests) ; sinon adossé à Prisma. */
  mappingRepository?: MappingRepository;
  /** Repository rapprochement vente→stock injecté (tests) ; sinon adossé à Prisma. */
  reconciliationRepository?: ReconciliationRepository;
  /** Repository anomalies d'intégration injecté (tests) ; sinon adossé à Prisma. */
  alertRepository?: AlertRepository;
  /** Repository exports CSV injecté (tests) ; sinon adossé à Prisma. */
  exportRepository?: ExportRepository;
  /** Repository module d'affichage injecté (tests) ; sinon adossé à Prisma. */
  displayRepository?: DisplayRepository;
}

/**
 * Construit l'instance Fastify sans l'écouter — testable via `app.inject`
 * (séparation app/server, SPEC M0-05).
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  // Corps JSON vide toléré (bug #218) : le client web pose `content-type:
  // application/json` même sur les POST **sans corps** (logout, publish, archive,
  // démarrage Jour J…). Le parser par défaut de Fastify rejette un corps vide en
  // 400 ; on le traite comme « pas de corps » (undefined). Un corps non vide mais
  // JSON invalide reste refusé en 400.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = (typeof body === "string" ? body : body.toString("utf8")).trim();
    if (text.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = Object.assign(new Error("Corps JSON invalide"), { statusCode: 400 });
      done(err, undefined);
    }
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
  await app.register(batchCycleRoutes, {
    prefix: "/api",
    cycleRepository: opts.cycleRepository,
    repository: opts.batchRepository,
  });
  await app.register(batchPackagingRoutes, {
    prefix: "/api",
    packagingRepository: opts.packagingRepository,
    repository: opts.batchRepository,
    recipeRepository: opts.recipeRepository,
  });
  await app.register(referentialsRoutes, {
    prefix: "/api",
    catalogRepository: opts.catalogRepository,
  });
  await app.register(stockRoutes, { prefix: "/api", repository: opts.stockRepository });

  // Repository d'audit résolu une fois : partagé par les modules membres/RGPD/
  // rapprochement (via `AuditService.record`) pour tracer les actions sensibles.
  const auditRepository = opts.auditRepository ?? new PrismaAuditRepository(prisma);

  // Journal d'audit (M6-03).
  await app.register(auditRoutes, { prefix: "/api", repository: auditRepository });
  // Fichier membres (M6-04) : partage le même repository d'audit.
  await app.register(membersRoutes, {
    prefix: "/api",
    repository: opts.memberRepository,
    auditRepository,
  });

  // Rapprochement cotisation→membre (M6-08) : service partagé entre les endpoints
  // `/transactions` et l'auto-rapprochement déclenché par le webhook (M6-07).
  const transactionService = new TransactionService(
    opts.transactionRepository ?? new PrismaTransactionRepository(prisma),
    new AuditService(auditRepository),
  );
  await app.register(transactionsRoutes, { prefix: "/api", service: transactionService });

  // Mapping SKU↔produit externe (M7-04) : CRUD sous RBAC `mapping` (caisse/admin).
  // Clé du rapprochement vente→stock (M7-05).
  await app.register(mappingRoutes, { prefix: "/api", repository: opts.mappingRepository });

  // Rapprochement vente→stock (M7-05, cœur démo) : service partagé entre le
  // re-traitement manuel `/transactions/:id/reprocess` et le rapprochement auto
  // déclenché par le webhook de vente (best-effort).
  const reconciliationService = new ReconciliationService(
    opts.reconciliationRepository ?? new PrismaReconciliationRepository(prisma),
  );
  await app.register(reconciliationRoutes, { prefix: "/api", service: reconciliationService });

  // Dashboard des anomalies (M7-06) : service partagé entre les routes `/alerts`
  // et l'émission d'une `WEBHOOK_FAILURE` sur échec d'ingestion post-signature.
  const alertService = new AlertService(opts.alertRepository ?? new PrismaAlertRepository(prisma));
  await app.register(alertsRoutes, { prefix: "/api", service: alertService });

  // Exports CSV comptables (M7-07) : read-only sous RBAC `transactions:read`.
  await app.register(exportsRoutes, { prefix: "/api", repository: opts.exportRepository });

  // Module d'affichage (M7-08) : CRUD surfaces/écrans/produits + rendu synchronisé
  // au stock sous RBAC `affichage` (admin CRUD ; brasseur/caisse RU). Le rendu
  // n'expose que les produits disponibles (stock > 0) — base de la vue temps réel (M7-13).
  await app.register(displayRoutes, { prefix: "/api", repository: opts.displayRepository });

  // Webhooks (M6-07) : route PUBLIQUE (signature = auth), hors préfixe `/api`
  // comme /health et /auth. Fondation générique réutilisée par M7. Une cotisation
  // déclenche l'auto-rapprochement membre (M6-08) ; une vente, le rapprochement
  // vente→stock (M7-05). Les deux post-traitements sont best-effort. Un échec
  // d'ingestion post-signature émet une anomalie WEBHOOK_FAILURE (M7-06).
  await app.register(webhooksRoutes, {
    repository: opts.webhookRepository,
    secretResolver: opts.webhookSecretResolver,
    onMembershipIngested: ({ transactionId, payerEmail }) =>
      transactionService.autoReconcile(transactionId, payerEmail).then(() => undefined),
    onSaleIngested: ({ transactionId }) =>
      reconciliationService.reconcileSale(transactionId).then(() => undefined),
    onWebhookFailure: (providerId, message) =>
      alertService.recordWebhookFailure(providerId, message),
  });

  return app;
}
