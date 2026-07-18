/**
 * Routes du **cycle post-Jour J** d'un brassin (M9-07) : jalons datés du cycle
 * (fermentation, dry hop, cold crash, garde) et synthèse des volumes.
 *
 * RBAC sur la ressource `recettes` (domaine brassage, matrice §3.5 figée ADR-10)
 * — **aucune ressource nouvelle** : lecture = `read`, ajustements = `update`,
 * création de la séquence = `create`. Rappel deny-by-default : une route sans
 * `config: app.rbac(...)` est refusée.
 *
 * Les transitions de statut restent sur `POST /batches/:id/status` (module
 * `routes.ts`) : le flux linéaire couvre déjà tout le cycle jusqu'à `TERMINE`.
 */

import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { type BatchCycleRepository, PrismaBatchCycleRepository } from "./cycle.repository.js";
import { BatchCycleService } from "./cycle.service.js";
import type { BatchRepository } from "./repository.js";
import { PrismaBatchRepository } from "./repository.js";
import { milestoneCreateBody, milestoneParams, milestonePatchBody } from "./schema.js";

export interface BatchCycleRoutesOptions {
  /** Repository de cycle injecté (tests) ; sinon adossé à Prisma. */
  cycleRepository?: BatchCycleRepository;
  /** Repository de batchs, partagé avec le module `batches`. */
  repository?: BatchRepository;
}

const idParams = z.object({ id: z.string().min(1) });

export const batchCycleRoutes: FastifyPluginAsync<BatchCycleRoutesOptions> = async (app, opts) => {
  const cycleRepository = opts.cycleRepository ?? new PrismaBatchCycleRepository(prisma);
  const batchRepository = opts.repository ?? new PrismaBatchRepository(prisma);
  const service = new BatchCycleService(cycleRepository, batchRepository);

  app.post(
    "/batches/:id/milestones",
    { config: app.rbac("recettes", "create") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = milestoneCreateBody.parse(request.body ?? {});
      const { milestones, created } = await service.createMilestones(id, body);
      // Rejeu d'une file offline : la séquence existait déjà → 200, pas 201 ni
      // erreur. L'appelant ne doit pas voir échouer une action déjà appliquée.
      return reply.code(created ? 201 : 200).send({ milestones, created });
    },
  );

  app.get("/batches/:id/milestones", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { milestones: await service.listMilestones(id) };
  });

  app.patch(
    "/batches/:id/milestones/:kind",
    { config: app.rbac("recettes", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { kind } = milestoneParams.parse(request.params);
      const body = milestonePatchBody.parse(request.body);
      return { milestones: await service.patchMilestone(id, kind, body) };
    },
  );

  app.get("/batches/:id/volumes", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { volumes: await service.volumes(id) };
  });
};
