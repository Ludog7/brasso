/**
 * Payloads CRUD des profils d'équipement (M3-03), composés depuis le schéma Zod
 * partagé `@brasso/core` (ADR-04). `isActive` n'est pas pilotable à la création
 * (toujours actif) mais l'est à la mise à jour (réactivation).
 */

import { equipmentProfileSchema } from "@brasso/core";
import { z } from "zod";

/** Corps de création — le profil est actif par défaut (piloté serveur). */
export const equipmentCreateBody = equipmentProfileSchema;
export type EquipmentCreateBody = z.infer<typeof equipmentCreateBody>;

/** Corps de mise à jour partielle. `isActive` permet la réactivation. */
export const equipmentUpdateBody = equipmentProfileSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();
export type EquipmentUpdateBody = z.infer<typeof equipmentUpdateBody>;

/** Filtres de liste (`GET /api/equipment-profiles`). */
export const equipmentListQuery = z.object({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type EquipmentListQuery = z.infer<typeof equipmentListQuery>;
