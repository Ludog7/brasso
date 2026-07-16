/**
 * Schémas Zod du module `alerts` (M7-06) : filtres de liste et corps de résolution
 * d'une anomalie d'intégration (`IntegrationAlert`). Les enums reprennent la forme
 * cible de {{M7-01}} (`@brasso/core`, ADR-04).
 */

import { integrationAlertStatusSchema, integrationAlertTypeSchema } from "@brasso/core";
import { z } from "zod";

/** Filtres + pagination de `GET /alerts` (ex. `?status=OPEN&type=UNMAPPED_TRANSACTION`). */
export const alertListQuery = z.object({
  status: integrationAlertStatusSchema.optional(),
  type: integrationAlertTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AlertListQuery = z.infer<typeof alertListQuery>;

/**
 * Corps de `POST /alerts/:id/resolve`. `stockAdjustment` optionnel → un mouvement
 * `ADJUSTMENT` (registre M5) pour compenser manuellement une vente non mappée.
 * `delta` non nul (un ajustement de 0 n'a pas de sens).
 */
export const alertResolveBody = z.object({
  stockAdjustment: z
    .object({
      catalogItemId: z.string().min(1),
      delta: z
        .number()
        .finite()
        .refine((v) => v !== 0, { message: "delta doit être non nul" }),
      note: z.string().min(1).optional(),
    })
    .optional(),
});
export type AlertResolveBody = z.infer<typeof alertResolveBody>;
