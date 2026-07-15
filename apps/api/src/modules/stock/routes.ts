import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { StockRepository } from "./repository.js";
import { PrismaStockRepository } from "./repository.js";
import {
  catalogItemCreateBody,
  catalogItemUpdateBody,
  stockItemListQuery,
  stockLotCreateBody,
} from "./schema.js";
import { StockService } from "./service.js";

export interface StockRoutesOptions {
  /** Repository injecté (tests) ; sinon adossé à Prisma. */
  repository?: StockRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/**
 * Module `stock` (M5-03) — gestion du stock : CRUD catalogue, lots, et liste des
 * articles **avec niveau dérivé** du registre append-only + indicateur de seuil.
 * RBAC deny-by-default sur la ressource `stocks` (matrice §3.5) : lectures
 * admin/brasseur/caisse ; écritures admin/brasseur (caisse → 403).
 * Frontière : le picker lecture seule `GET /catalog-items` (éditeur) reste dans
 * `referentials` ; ce module ne le duplique pas.
 */
export const stockRoutes: FastifyPluginAsync<StockRoutesOptions> = async (app, opts) => {
  const repository = opts.repository ?? new PrismaStockRepository(prisma);
  const service = new StockService(repository);

  app.get("/stock/items", { config: app.rbac("stocks", "read") }, async (request) => {
    const { limit, offset, ...filters } = stockItemListQuery.parse(request.query);
    const { items, total } = await service.listItems({ ...filters, limit, offset });
    return { items, total, limit, offset };
  });

  app.get("/stock/items/:id", { config: app.rbac("stocks", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { item: await service.getItem(id) };
  });

  app.post("/stock/items", { config: app.rbac("stocks", "create") }, async (request, reply) => {
    const body = catalogItemCreateBody.parse(request.body);
    const item = await service.createItem(body);
    return reply.code(201).send({ item });
  });

  app.patch("/stock/items/:id", { config: app.rbac("stocks", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = catalogItemUpdateBody.parse(request.body);
    return { item: await service.updateItem(id, body) };
  });

  app.post(
    "/stock/items/:id/lots",
    { config: app.rbac("stocks", "create") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = stockLotCreateBody.parse(request.body);
      const lot = await service.createLot(id, body);
      return reply.code(201).send({ lot });
    },
  );
};
