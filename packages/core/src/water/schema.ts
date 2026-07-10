/**
 * Schémas Zod des profils d'eau (M3-02, ADR-04). Un profil décrit une eau par ses
 * ions en **mg/L** (Annexe D). `equipmentWaterProfilesSchema` est la forme stockée
 * dans `EquipmentProfile.waterProfiles` (JSONB) — M3-03 branchera ce schéma sur la
 * validation CRUD de l'API. Zéro dépendance DB/UI (ADR-03).
 */

import { z } from "zod";

/** Un ion en mg/L : nombre ≥ 0, défaut 0 (analyse partielle tolérée). */
const ionField = z.number().nonnegative().default(0);

/**
 * Profil d'eau : les six ions brassicoles (mg/L, ≥ 0) + nom optionnel. Les ions
 * absents sont ramenés à 0. Aucune allégation de conformité (ADR-11).
 */
export const waterProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  calcium: ionField,
  magnesium: ionField,
  sodium: ionField,
  sulfate: ionField,
  chloride: ionField,
  bicarbonate: ionField,
});

export type WaterProfile = z.infer<typeof waterProfileSchema>;

/**
 * Enveloppe des profils d'eau d'un équipement : une eau réseau de `base` et des
 * cibles `targetsByStyle` indexées par clé de style (chaîne libre). Forme stockée
 * telle quelle dans `EquipmentProfile.waterProfiles` (JSONB, ADR-04).
 */
export const equipmentWaterProfilesSchema = z.object({
  base: waterProfileSchema.optional(),
  targetsByStyle: z.record(z.string().min(1), waterProfileSchema).optional(),
});

export type EquipmentWaterProfiles = z.infer<typeof equipmentWaterProfilesSchema>;
