/**
 * Routes de **conditionnement** d'un brassin (M9-08) : saisie des quantités par
 * contenant, création du stock de produits finis, correction par mouvement
 * inverse et aide à la répartition.
 *
 * RBAC : conditionner **écrit du stock**, donc `("stocks", "create")` — le
 * couple le plus restrictif des deux domaines touchés. La transition du brassin
 * qui s'ensuit relève de `("recettes", "update")` et est portée par le service,
 * qui délègue à `BatchService.changeStatus` (M9-07).
 */

import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { RecipeRepository } from "../recipes/repository.js";
import { PrismaRecipeRepository } from "../recipes/repository.js";
import { type PackagingRepository, PrismaPackagingRepository } from "./packaging.repository.js";
import { BatchPackagingService } from "./packaging.service.js";
import type { BatchRepository } from "./repository.js";
import { PrismaBatchRepository } from "./repository.js";
import { packagingCorrectionBody, packagingRecordBody, packagingSplitQuery } from "./schema.js";
import { BatchService } from "./service.js";

export interface BatchPackagingRoutesOptions {
  /** Repository de conditionnement injecté (tests) ; sinon adossé à Prisma. */
  packagingRepository?: PackagingRepository;
  /** Repository de batchs, partagé avec le module `batches`. */
  repository?: BatchRepository;
  /** Repository de recettes, requis par `BatchService`. */
  recipeRepository?: RecipeRepository;
}

const idParams = z.object({ id: z.string().min(1) });

export const batchPackagingRoutes: FastifyPluginAsync<BatchPackagingRoutesOptions> = async (
  app,
  opts,
) => {
  const packagingRepository = opts.packagingRepository ?? new PrismaPackagingRepository(prisma);
  const batchRepository = opts.repository ?? new PrismaBatchRepository(prisma);
  const recipeRepository = opts.recipeRepository ?? new PrismaRecipeRepository(prisma);
  const service = new BatchPackagingService(
    packagingRepository,
    batchRepository,
    new BatchService(batchRepository, recipeRepository),
  );

  app.post(
    "/batches/:id/packaging",
    { config: app.rbac("stocks", "create") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = packagingRecordBody.parse(request.body);
      const result = await service.record(id, body, request.user?.id ?? null);
      return reply.code(201).send(result);
    },
  );

  app.get("/batches/:id/packaging", { config: app.rbac("stocks", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { packaging: await service.list(id) };
  });

  // Correction d'une saisie : mouvement **inverse**, jamais une modification du
  // mouvement d'origine (registre append-only, §3.3).
  app.post(
    "/batches/:id/packaging/corrections",
    { config: app.rbac("stocks", "create") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = packagingCorrectionBody.parse(request.body);
      const movement = await service.correct(id, body, request.user?.id ?? null);
      return reply.code(201).send({ movement });
    },
  );

  // Aide à la saisie : propose une répartition, n'écrit rien — d'où `read`.
  app.post(
    "/batches/:id/packaging:split",
    { config: app.rbac("stocks", "read") },
    async (request) => {
      idParams.parse(request.params);
      const query = packagingSplitQuery.parse(request.body);
      return { split: service.proposeSplit(query) };
    },
  );
};
