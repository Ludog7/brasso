/**
 * Routes de la **session Jour J** (M4-04) : démarrer et charger le déroulé d'un
 * brassage sur tablette. RBAC sur la ressource `recettes` (domaine brassage,
 * matrice §3.5 figée ADR-10) — `start` = `update` (mutation), `get` = `read`.
 * Les transitions (M4-05) et le rejeu offline (M4-06) sont d'autres tickets.
 */

import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { type DayRepository, PrismaBatchDayRepository } from "./day.repository.js";
import { BatchDayService } from "./day.service.js";

export interface BatchDayRoutesOptions {
  /** Repository de session Jour J injecté (tests) ; sinon adossé à Prisma. */
  dayRepository?: DayRepository;
}

const idParams = z.object({ id: z.string().min(1) });

export const batchDayRoutes: FastifyPluginAsync<BatchDayRoutesOptions> = async (app, opts) => {
  const repository = opts.dayRepository ?? new PrismaBatchDayRepository(prisma);
  const service = new BatchDayService(repository);

  app.post(
    "/batches/:id/day/start",
    { config: app.rbac("recettes", "update") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { created, day } = await service.start(id);
      return reply.code(created ? 201 : 200).send({ day });
    },
  );

  app.get("/batches/:id/day", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { day: await service.get(id) };
  });
};
