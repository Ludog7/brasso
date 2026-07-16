import { prisma } from "@brasso/db";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AlertRepository } from "./repository.js";
import { PrismaAlertRepository } from "./repository.js";
import { alertListQuery, alertResolveBody } from "./schema.js";
import { AlertService } from "./service.js";

export interface AlertRoutesOptions {
  /** Service pré-construit (partagé avec l'émission `WEBHOOK_FAILURE` du webhook). */
  service?: AlertService;
  /** Repository injecté (tests) si aucun service fourni ; sinon adossé à Prisma. */
  repository?: AlertRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/**
 * Module `alerts` (M7-06) — dashboard des anomalies d'intégration. **Lecture** sous
 * RBAC `transactions:read` (même famille que les transactions : caisse/brasseur/admin).
 * **Résolution** sous RBAC `mapping:update` (choix de cadrage : le côté « write » de
 * la résolution — ajustement de stock manuel — est autorisé à caisse/admin, comme
 * le mapping) — refusé à `brasseur`/`rgpd`.
 */
export const alertsRoutes: FastifyPluginAsync<AlertRoutesOptions> = async (app, opts) => {
  const service =
    opts.service ?? new AlertService(opts.repository ?? new PrismaAlertRepository(prisma));

  app.get("/alerts", { config: app.rbac("transactions", "read") }, async (request) => {
    const { limit, offset, ...filters } = alertListQuery.parse(request.query);
    const { alerts, total } = await service.list({ ...filters, limit, offset });
    return { alerts, total, limit, offset };
  });

  app.get("/alerts/:id", { config: app.rbac("transactions", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { alert: await service.get(id) };
  });

  app.post("/alerts/:id/resolve", { config: app.rbac("mapping", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = alertResolveBody.parse(request.body);
    const userId = (request as FastifyRequest).user?.id ?? null;
    return { alert: await service.resolve(id, body, userId) };
  });
};
