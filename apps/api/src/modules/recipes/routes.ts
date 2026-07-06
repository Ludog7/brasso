import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { RecipeRepository } from "./repository.js";
import { PrismaRecipeRepository } from "./repository.js";
import { recipeCreateBody, recipeListQuery } from "./schema.js";
import { RecipeService } from "./service.js";

export interface RecipesRoutesOptions {
  /** Repository injecté (tests) ; sinon adossé à Prisma. */
  repository?: RecipeRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/**
 * Module `recipes` (M2-01, ADR-06) — CRUD des recettes `DRAFT` polymorphes
 * (commun + table de détail par moteur). RBAC déclaré route par route (matrice
 * §3.5 : admin/brasseur CRUD, caisse lecture seule). Validation par les schémas
 * Zod partagés de `@brasso/core`. Erreurs normalisées par l'error handler global
 * (400 validation, 404 introuvable, 409 non-DRAFT).
 */
export const recipesRoutes: FastifyPluginAsync<RecipesRoutesOptions> = async (app, opts) => {
  const repository = opts.repository ?? new PrismaRecipeRepository(prisma);
  const service = new RecipeService(repository);

  app.get("/recipes", { config: app.rbac("recettes", "read") }, async (request) => {
    const filters = recipeListQuery.parse(request.query);
    return { recipes: await service.list(filters) };
  });

  app.get("/recipes/:id", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { recipe: await service.get(id) };
  });

  app.post("/recipes", { config: app.rbac("recettes", "create") }, async (request, reply) => {
    const body = recipeCreateBody.parse(request.body);
    const recipe = await service.create(body);
    return reply.code(201).send({ recipe });
  });

  app.patch("/recipes/:id", { config: app.rbac("recettes", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { recipe: await service.update(id, request.body) };
  });

  app.delete("/recipes/:id", { config: app.rbac("recettes", "delete") }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await service.remove(id);
    return reply.code(204).send();
  });

  // Sous-ressources (M2-02) : remplacement complet ordonné, DRAFT uniquement.
  app.put(
    "/recipes/:id/ingredients",
    { config: app.rbac("recettes", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return { recipe: await service.replaceIngredients(id, request.body) };
    },
  );

  app.put("/recipes/:id/steps", { config: app.rbac("recettes", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { recipe: await service.replaceSteps(id, request.body) };
  });

  // Cycle de vie (M2-03, ADR-07). Transitions strictes DRAFT → PUBLISHED → ARCHIVED.
  app.post("/recipes/:id/publish", { config: app.rbac("recettes", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { recipe: await service.publish(id) };
  });

  app.post(
    "/recipes/:id/new-version",
    // Crée un nouveau brouillon : action de création dans la famille.
    { config: app.rbac("recettes", "create") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const recipe = await service.createNewVersion(id);
      return reply.code(201).send({ recipe });
    },
  );

  app.post("/recipes/:id/archive", { config: app.rbac("recettes", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { recipe: await service.archive(id) };
  });
};
