/**
 * Schéma Zod d'un **batch** (Prisma `Batch`, M1-01) — payload de planification.
 *
 * Le `recipeSnapshot` (JSONB immuable, ADR-06/07) et les horodatages de cycle
 * sont posés côté serveur ; on valide ici l'entrée de création/planification.
 * ADR-04/ADR-03.
 */

import { z } from "zod";

import { batchStatusSchema } from "./enums.js";

/** Création / planification d'un batch (référence une version de recette figée). */
export const batchSchema = z.object({
  recipeId: z.string().min(1),
  /** Version de recette figée dans le snapshot (ADR-06). */
  recipeVersion: z.number().int().positive(),
  status: batchStatusSchema.default("PLANIFIE"),
  equipmentProfileId: z.string().min(1).optional(),
  plannedAt: z.coerce.date().optional(),
});

export type BatchInput = z.infer<typeof batchSchema>;
