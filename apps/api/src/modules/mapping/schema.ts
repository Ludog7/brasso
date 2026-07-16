/**
 * Schémas Zod du module `mapping` (M7-04) : CRUD des correspondances SKU interne ↔
 * produit externe. Le corps de création reprend la **forme cible** `skuMappingInputSchema`
 * de {{M7-01}} (`@brasso/core`, ADR-04) ; la mise à jour en est la version partielle.
 */

import { skuMappingInputSchema } from "@brasso/core";
import { z } from "zod";

/** Corps de `POST /mappings` — forme cible core (M7-01). */
export const mappingCreateBody = skuMappingInputSchema;
export type MappingCreateBody = z.infer<typeof mappingCreateBody>;

/**
 * Corps de `PATCH /mappings/:id` — sous-ensemble modifiable, **au moins un champ**.
 * `catalogItemId: null` détache l'article ; absent = inchangé (distinction portée
 * par le service).
 */
export const mappingUpdateBody = skuMappingInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Au moins un champ à mettre à jour",
  });
export type MappingUpdateBody = z.infer<typeof mappingUpdateBody>;

/** Filtres + pagination de `GET /mappings` (filtrable par fournisseur). */
export const mappingListQuery = z.object({
  providerId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type MappingListQuery = z.infer<typeof mappingListQuery>;
