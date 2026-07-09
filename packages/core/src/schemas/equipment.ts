/**
 * Schéma Zod partagé d'un **profil d'équipement** (M3-03) — aligné sur Prisma
 * `EquipmentProfile` (schéma M1). Réutilisé par l'API (validation CRUD) et le front
 * (formulaire). ADR-04 : Zod vit dans `core`. Unités internes (L, kW, kJ/°C, L/kg).
 *
 * `waterProfiles` reste un JSON opaque à ce stade : le schéma strict de chimie de
 * l'eau (base réseau + cibles par style) est fourni par M3-02, qui resserrera ce
 * champ.
 */

import { z } from "zod";

/** Champs d'un profil d'équipement (création). `isActive` est piloté serveur. */
export const equipmentProfileSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(200),
  /** Volume nominal de la cuve (L) — strictement positif. */
  nominalVolumeL: z.number().positive(),
  /** Volume mort / pertes système (L). */
  deadspaceL: z.number().nonnegative().default(0),
  /** Pertes au transfert vers le fermenteur (L). */
  transferLossL: z.number().nonnegative().default(0),
  /** Taux d'évaporation à l'ébullition (L/h). */
  evaporationRateLPerHour: z.number().nonnegative().default(0),
  /** Absorption d'eau par le grain (L/kg). */
  grainAbsorptionLPerKg: z.number().nonnegative().default(0),
  /** Puissance de chauffe (kW) — estimation des rampes (Jour J, M4). */
  heatingPowerKw: z.number().positive().nullish(),
  /** Masse thermique de la cuve (kJ/°C) — estimation temps de montée. */
  thermalMassKjPerC: z.number().positive().nullish(),
  /** Profils d'eau (JSONB) — schéma strict fourni par M3-02. */
  waterProfiles: z.record(z.unknown()).nullish(),
});

export type EquipmentProfileInput = z.infer<typeof equipmentProfileSchema>;
