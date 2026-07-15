import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { StockRepository } from "./repository.js";
import { PrismaStockRepository } from "./repository.js";
import {
  catalogItemCreateBody,
  catalogItemUpdateBody,
  inventoryBody,
  movementListQuery,
  stockItemListQuery,
  stockLotCreateBody,
  stockMovementBody,
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

  // Registre append-only : un mouvement manuel (achat, ajustement, forfait BULK,
  // perte…). `PRODUCTION`/`SALE` sont exclus par le schéma (batch / hub caisse).
  app.post("/stock/movements", { config: app.rbac("stocks", "update") }, async (request, reply) => {
    const body = stockMovementBody.parse(request.body);
    const result = await service.createMovement(body, request.user?.id ?? null);
    return reply.code(201).send(result);
  });

  app.get("/stock/items/:id/movements", { config: app.rbac("stocks", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    const { limit, offset } = movementListQuery.parse(request.query);
    const { movements, total } = await service.listMovements(id, { limit, offset });
    return { movements, total, limit, offset };
  });

  // Inventaire périodique : chaque écart génère un mouvement d'ajustement
  // `INVENTORY` (transactionnel) ; ligne sans écart = no-op (`unchanged`).
  app.post("/stock/inventory", { config: app.rbac("stocks", "update") }, async (request) => {
    const body = inventoryBody.parse(request.body);
    const lines = await service.applyInventory(body, request.user?.id ?? null);
    return { lines };
  });

  // Déduction à l'ensemencement (M5-05, démo + rattrapage) : consomme/rejoue les
  // réservations d'un batch ensemencé. Idempotent (409 si < EN_FERMENTATION).
  // La même consommation est aussi déclenchée automatiquement à l'entrée en
  // EN_FERMENTATION (changeStatus M3-06 + clôture Jour J M4-05), dans leur transaction.
  app.post(
    "/batches/:id/stock/consume",
    { config: app.rbac("stocks", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return service.consumeForBatch(id, request.user?.id ?? null);
    },
  );
};
