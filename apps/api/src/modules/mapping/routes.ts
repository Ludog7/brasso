import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { MappingRepository } from "./repository.js";
import { PrismaMappingRepository } from "./repository.js";
import { mappingCreateBody, mappingListQuery, mappingUpdateBody } from "./schema.js";
import { MappingService } from "./service.js";

export interface MappingRoutesOptions {
  /** Repository mapping injecté (tests) ; sinon adossé à Prisma. */
  repository?: MappingRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/**
 * Module `mapping` (M7-04) — CRUD des correspondances SKU↔produit externe. RBAC
 * deny-by-default sur la ressource `mapping` (§3.5) : `caisse`/`admin` CRUD,
 * `brasseur` lecture seule, `rgpd` aucun. La lecture des transactions externes
 * (read-only, ADR-09) vit dans le module `transactions`.
 */
export const mappingRoutes: FastifyPluginAsync<MappingRoutesOptions> = async (app, opts) => {
  const service = new MappingService(opts.repository ?? new PrismaMappingRepository(prisma));

  app.get("/mappings", { config: app.rbac("mapping", "read") }, async (request) => {
    const { limit, offset, ...filters } = mappingListQuery.parse(request.query);
    const { mappings, total } = await service.list({ ...filters, limit, offset });
    return { mappings, total, limit, offset };
  });

  app.post("/mappings", { config: app.rbac("mapping", "create") }, async (request, reply) => {
    const body = mappingCreateBody.parse(request.body);
    return reply.code(201).send({ mapping: await service.create(body) });
  });

  app.patch("/mappings/:id", { config: app.rbac("mapping", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = mappingUpdateBody.parse(request.body);
    return { mapping: await service.update(id, body) };
  });

  app.delete("/mappings/:id", { config: app.rbac("mapping", "delete") }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await service.delete(id);
    return reply.code(204).send();
  });
};
