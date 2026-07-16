import { prisma } from "@brasso/db";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AuditRepository } from "../audit/repository.js";
import { PrismaAuditRepository } from "../audit/repository.js";
import { AuditService } from "../audit/service.js";
import type { TransactionRepository } from "./repository.js";
import { PrismaTransactionRepository } from "./repository.js";
import { reconcileBody, transactionListQuery } from "./schema.js";
import { type Actor, TransactionService } from "./service.js";

export interface TransactionRoutesOptions {
  /** Service pré-construit (partagé avec l'auto-rapprochement du webhook). */
  service?: TransactionService;
  /** Repository injecté (tests) si aucun service fourni ; sinon adossé à Prisma. */
  repository?: TransactionRepository;
  /** Repository d'audit partagé (tests) si aucun service fourni. */
  auditRepository?: AuditRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/** Extrait l'acteur (session + IP) d'une requête pour la traçabilité d'audit. */
function actorOf(request: FastifyRequest): Actor {
  return { userId: request.user?.id ?? null, ip: request.ip };
}

/**
 * Module `transactions` (M6-08) — transactions externes (ADR-09, read-only) et
 * rapprochement cotisation→membre. RBAC deny-by-default : lecture sur la ressource
 * `transactions` (admin/brasseur/caisse) ; le rapprochement modifie une donnée
 * d'adhésion → ressource `membres` action `update` (admin/rgpd).
 */
export const transactionsRoutes: FastifyPluginAsync<TransactionRoutesOptions> = async (
  app,
  opts,
) => {
  const service =
    opts.service ??
    new TransactionService(
      opts.repository ?? new PrismaTransactionRepository(prisma),
      new AuditService(opts.auditRepository ?? new PrismaAuditRepository(prisma)),
    );

  // Liste « à rapprocher » : ex. ?status=UNMAPPED&kind=MEMBERSHIP, occurredAt desc.
  app.get("/transactions", { config: app.rbac("transactions", "read") }, async (request) => {
    const { limit, offset, ...filters } = transactionListQuery.parse(request.query);
    const { transactions, total } = await service.list({ ...filters, limit, offset });
    return { transactions, total, limit, offset };
  });

  // Rapprochement manuel (repli quand l'auto échoue).
  app.post(
    "/transactions/:id/reconcile",
    { config: app.rbac("membres", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { memberId } = reconcileBody.parse(request.body);
      return { transaction: await service.reconcileManual(id, memberId, actorOf(request)) };
    },
  );
};
