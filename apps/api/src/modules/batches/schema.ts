/**
 * Payloads de planification de batch (M3-04). Le corps de création est réduit à ce
 * que le client fournit : la **version**, le **snapshot** de recette et le **numéro**
 * sont posés côté serveur (ADR-06/07), jamais pilotés par le client.
 */

import { batchMeasureSchema, batchStatusSchema, measureTypeSchema } from "@brasso/core";
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

/**
 * Corps d'une mesure append-only (M3-06). Réutilise `batchMeasureSchema` de core
 * (bornes de plausibilité par type) + un `loggedAt` optionnel : une relève peut
 * être antidatée (mesure prise plus tôt, saisie après coup). `loggedById` vient
 * de l'utilisateur courant, jamais du client.
 */
export const measureCreateBody = batchMeasureSchema.and(
  z.object({ loggedAt: z.coerce.date().optional() }),
);
export type MeasureCreateBody = z.infer<typeof measureCreateBody>;

/** Filtre de relecture des mesures (`GET /api/batches/:id/measures?type=`). */
export const measureListQuery = z.object({ type: measureTypeSchema.optional() });
export type MeasureListQuery = z.infer<typeof measureListQuery>;

/** Corps de transition de statut (`POST /api/batches/:id/status`). */
export const statusChangeBody = z.object({ status: batchStatusSchema });
export type StatusChangeBody = z.infer<typeof statusChangeBody>;

/**
 * Paramètres du coût de revient (`GET /api/batches/:id/cost`) : imputation bulk
 * forfaitaire (centimes) et nombre d'unités conditionnées (coût à l'unité).
 */
export const costQuery = z.object({
  bulkForfaitCents: z.coerce.number().int().nonnegative().optional(),
  packagedUnits: z.coerce.number().int().positive().optional(),
});
export type CostQuery = z.infer<typeof costQuery>;
