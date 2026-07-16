import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { PrismaReconciliationRepository } from "./repository.js";
import { ReconciliationService } from "./service.js";

export interface ReconciliationRoutesOptions {
  /** Service pré-construit (partagé avec le rapprochement auto du webhook). */
  service?: ReconciliationService;
}

const idParams = z.object({ id: z.string().min(1) });

/**
 * Module `reconciliation` (M7-05) — re-traitement **manuel** d'une vente. RBAC
 * ressource `mapping` action `update` : l'opération suppose qu'un mapping a été
 * créé entre-temps (caisse/admin). Le rapprochement **automatique** à l'ingestion
 * est branché sur le webhook (hook `onSaleIngested`), pas exposé en route.
 */
export const reconciliationRoutes: FastifyPluginAsync<ReconciliationRoutesOptions> = async (
  app,
  opts,
) => {
  const service =
    opts.service ?? new ReconciliationService(new PrismaReconciliationRepository(prisma));

  app.post(
    "/transactions/:id/reprocess",
    { config: app.rbac("mapping", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return { result: await service.reprocess(id) };
    },
  );
};
