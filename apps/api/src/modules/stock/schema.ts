/**
 * Payloads du module `stock` (M5-03), composés depuis les schémas Zod partagés
 * `@brasso/core` (ADR-04). La création d'un lot prend l'article dans l'URL
 * (`POST /stock/items/:id/lots`) → `catalogItemId` retiré du corps.
 */

import {
  catalogItemSchema,
  catalogItemUpdateSchema,
  catalogKindSchema,
  ingredientCategorySchema,
  stockLotSchema,
} from "@brasso/core";
import { z } from "zod";

/** Corps de création d'un article de catalogue (`RECETTE` → catégorie requise). */
export const catalogItemCreateBody = catalogItemSchema;
export type CatalogItemInput = z.infer<typeof catalogItemCreateBody>;

/** Corps de mise à jour partielle. Le `kind` présent est refusé par le service. */
export const catalogItemUpdateBody = catalogItemUpdateSchema;
export type CatalogItemUpdate = z.infer<typeof catalogItemUpdateBody>;

/** Corps de création d'un lot (l'article vient de l'URL). */
export const stockLotCreateBody = stockLotSchema.omit({ catalogItemId: true });
export type StockLotInput = z.infer<typeof stockLotCreateBody>;

/** Filtres de liste (`GET /stock/items`) — pagination plafonnée à 100 (M2-04). */
export const stockItemListQuery = z.object({
  kind: catalogKindSchema.optional(),
  category: ingredientCategorySchema.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type StockItemListQuery = z.infer<typeof stockItemListQuery>;
