import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { RecipeRepository } from "../recipes/repository.js";
import { PrismaRecipeRepository } from "../recipes/repository.js";
import type { BatchRepository } from "./repository.js";
import { PrismaBatchRepository } from "./repository.js";
import {
  batchCreateBody,
  batchListQuery,
  costQuery,
  measureCreateBody,
  measureListQuery,
  statusChangeBody,
} from "./schema.js";
import { BatchService } from "./service.js";

export interface BatchesRoutesOptions {
  /** Repository de batchs injecté (tests) ; sinon adossé à Prisma. */
  repository?: BatchRepository;
  /** Repository de recettes injecté (tests) ; partagé avec le module `recipes`. */
  recipeRepository?: RecipeRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/**
 * Module `batches` (M3-04/05/06, ADR-07) — planification d'un batch depuis une
 * recette publiée (snapshot figé + numéro + réservation de stock), mesures
 * append-only et progression administrative de statut (hors state machine Jour J,
 * M4). RBAC sur la ressource `recettes` (domaine brassage, matrice §3.5 figée
 * ADR-10) : brasseur/admin CRUD (mesures + statut = `update`), caisse read.
 */
export const batchesRoutes: FastifyPluginAsync<BatchesRoutesOptions> = async (app, opts) => {
  const repository = opts.repository ?? new PrismaBatchRepository(prisma);
  const recipeRepository = opts.recipeRepository ?? new PrismaRecipeRepository(prisma);
  const service = new BatchService(repository, recipeRepository);

  app.get("/batches", { config: app.rbac("recettes", "read") }, async (request) => {
    const filters = batchListQuery.parse(request.query);
    return { batches: await service.list(filters) };
  });

  app.get("/batches/:id", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { batch: await service.get(id) };
  });

  app.post("/batches", { config: app.rbac("recettes", "create") }, async (request, reply) => {
    const body = batchCreateBody.parse(request.body);
    const result = await service.plan(body, request.user?.id ?? null);
    return reply.code(201).send(result);
  });

  app.post("/batches/:id/cancel", { config: app.rbac("recettes", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { batch: await service.cancel(id) };
  });

  app.post(
    "/batches/:id/measures",
    { config: app.rbac("recettes", "update") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = measureCreateBody.parse(request.body);
      const measure = await service.addMeasure(id, body, request.user?.id ?? null);
      return reply.code(201).send({ measure });
    },
  );

  app.get("/batches/:id/measures", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    const { type } = measureListQuery.parse(request.query);
    return { measures: await service.listMeasures(id, type) };
  });

  // `changed: false` = le batch portait déjà ce statut (rejeu de la file offline) :
  // réponse 200 sans effet rejoué, plutôt qu'une fausse erreur (M9-07).
  app.post("/batches/:id/status", { config: app.rbac("recettes", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    const { status } = statusChangeBody.parse(request.body);
    return await service.changeStatus(id, status, request.user?.id ?? null);
  });

  // Coût de revient **estimé** (coûts de référence catalogue, hors coût lot réel) :
  // consommé après ensemencement (mouvements PRODUCTION), sinon planifié (réservations).
  app.get("/batches/:id/cost", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    const options = costQuery.parse(request.query);
    return { cost: await service.cost(id, options) };
  });
};
