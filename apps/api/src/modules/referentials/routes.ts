import { catalogKindSchema, ingredientCategorySchema, searchBjcpStyles } from "@brasso/core";
import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { CatalogRepository } from "./repository.js";
import { PrismaCatalogRepository } from "./repository.js";

export interface ReferentialsRoutesOptions {
  /** Repository catalogue injecté (tests) ; sinon adossé à Prisma. */
  catalogRepository?: CatalogRepository;
}

const bjcpQuery = z.object({ search: z.string().optional() });

const catalogQuery = z.object({
  kind: catalogKindSchema.optional(),
  category: ingredientCategorySchema.optional(),
  search: z.string().optional(),
  // Pagination simple ; `limit` plafonné à 100 (SPEC M2-04).
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Module `referentials` (M2-04) — pickers lecture seule de l'éditeur de recettes.
 * Styles BJCP (référence statique `@brasso/core`) et catalogue d'ingrédients
 * (`CatalogItem`). RBAC déclaré explicitement (deny-by-default) : styles →
 * (recettes, read) ; catalogue → (stocks, read), cohérent matrice §3.5.
 */
export const referentialsRoutes: FastifyPluginAsync<ReferentialsRoutesOptions> = async (
  app,
  opts,
) => {
  const catalog = opts.catalogRepository ?? new PrismaCatalogRepository(prisma);

  app.get("/bjcp-styles", { config: app.rbac("recettes", "read") }, async (request) => {
    const { search } = bjcpQuery.parse(request.query);
    return { styles: searchBjcpStyles(search) };
  });

  app.get("/catalog-items", { config: app.rbac("stocks", "read") }, async (request) => {
    const { limit, offset, ...filters } = catalogQuery.parse(request.query);
    const { items, total } = await catalog.list({ ...filters, limit, offset });
    return { items, total, limit, offset };
  });
};
