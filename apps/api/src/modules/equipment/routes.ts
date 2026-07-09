import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { EquipmentRepository } from "./repository.js";
import { PrismaEquipmentRepository } from "./repository.js";
import { equipmentCreateBody, equipmentListQuery, equipmentUpdateBody } from "./schema.js";
import { EquipmentService } from "./service.js";

export interface EquipmentRoutesOptions {
  /** Repository injecté (tests) ; sinon adossé à Prisma. */
  repository?: EquipmentRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/**
 * Module `equipment` (M3-03) — CRUD des profils d'équipement (cuve : volumes,
 * pertes, calorique, profils d'eau). RBAC sur la ressource `recettes` (domaine
 * brassage, matrice §3.5 figée ADR-10) : brasseur/admin CRUD, caisse lecture.
 * Pas de suppression exposée → désactivation (préserve l'historique des batchs).
 */
export const equipmentRoutes: FastifyPluginAsync<EquipmentRoutesOptions> = async (app, opts) => {
  const repository = opts.repository ?? new PrismaEquipmentRepository(prisma);
  const service = new EquipmentService(repository);

  app.get("/equipment-profiles", { config: app.rbac("recettes", "read") }, async (request) => {
    const filters = equipmentListQuery.parse(request.query);
    return { profiles: await service.list(filters) };
  });

  app.get("/equipment-profiles/:id", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { profile: await service.get(id) };
  });

  app.post(
    "/equipment-profiles",
    { config: app.rbac("recettes", "create") },
    async (request, reply) => {
      const body = equipmentCreateBody.parse(request.body);
      const profile = await service.create(body);
      return reply.code(201).send({ profile });
    },
  );

  app.patch(
    "/equipment-profiles/:id",
    { config: app.rbac("recettes", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = equipmentUpdateBody.parse(request.body);
      return { profile: await service.update(id, body) };
    },
  );

  app.post(
    "/equipment-profiles/:id/deactivate",
    { config: app.rbac("recettes", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return { profile: await service.deactivate(id) };
    },
  );
};
