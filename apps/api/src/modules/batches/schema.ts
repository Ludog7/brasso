/**
 * Payloads de planification de batch (M3-04). Le corps de création est réduit à ce
 * que le client fournit : la **version**, le **snapshot** de recette et le **numéro**
 * sont posés côté serveur (ADR-06/07), jamais pilotés par le client.
 */

import { batchStatusSchema } from "@brasso/core";
import { z } from "zod";

/** Corps de planification : référence une recette + un équipement optionnel. */
export const batchCreateBody = z.object({
  recipeId: z.string().min(1),
  equipmentProfileId: z.string().min(1).optional(),
  plannedAt: z.coerce.date().optional(),
});
export type BatchCreateBody = z.infer<typeof batchCreateBody>;

/** Filtres de liste (`GET /api/batches`). */
export const batchListQuery = z.object({
  status: batchStatusSchema.optional(),
  recipeId: z.string().min(1).optional(),
});
export type BatchListQuery = z.infer<typeof batchListQuery>;
