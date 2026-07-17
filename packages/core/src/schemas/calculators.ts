/**
 * Schémas Zod des **calculateurs autonomes** (M8-01, ADR-04) — starter, eau (plan
 * d'empâtage/rinçage), dilution vers densité cible, BIAB. Réutilisés par l'API et le
 * front (validation d'entrée alignée). Outils **indépendants** d'une recette/d'un batch.
 *
 * SOURCE DE VÉRITÉ des formules : `docs/FORMULES-BRASSICOLES.md` §6, §9.3, §12.
 * Unités internes (CLAUDE.md) : L, kg, °C, SG brute (ex. 1.048).
 */

import { z } from "zod";

/** Style d'inoculation (taux de référence FORMULES §12.1 : ale 0.75, lager 1.5). */
export const starterStyleSchema = z.enum(["ale", "lager"]);
export type StarterStyle = z.infer<typeof starterStyleSchema>;

/**
 * Entrée du calcul de starter (§12.1). Le taux d'inoculation vient soit du `style`
 * (ale/lager), soit d'un `pitchRate` explicite (million cellules/mL/°P) qui prime.
 */
export const starterInputSchema = z.object({
  /** Densité initiale du moût (SG brute, > 1.000). */
  og: z.number().gt(1),
  /** Volume de moût à ensemencer (L, > 0). */
  volumeL: z.number().positive(),
  /** Style → taux de référence ; défaut `ale`. Ignoré si `pitchRate` est fourni. */
  style: starterStyleSchema.default("ale"),
  /** Taux d'inoculation explicite (M cellules/mL/°P) — prime sur `style`. */
  pitchRate: z.number().positive().optional(),
  /** Nombre d'unités de levure (sachets/packs) disponibles. */
  packs: z.number().int().nonnegative().default(0),
  /** Cellules par unité (en milliards ×10⁹) — sèche ≈ 200, pack liquide ≈ 100. */
  cellsPerPackB: z.number().nonnegative().default(0),
  /** Viabilité de la levure ∈ [0, 1] ; défaut 1 (fraîche). */
  viability: z.number().min(0).max(1).default(1),
});
export type StarterInput = z.infer<typeof starterInputSchema>;

/** Entrée du plan d'eau (§6.1/6.2/6.3) — empâtage + rinçage + strike, saisie manuelle. */
export const waterPlanInputSchema = z.object({
  /** Masse de grain (kg, > 0). */
  grainKg: z.number().positive(),
  /** Ratio d'empâtage (L/kg) ; défaut 3.0 (borne usuelle 2.5–4.0). */
  mashRatioLPerKg: z.number().positive().default(3.0),
  /** Volume pré-ébullition visé (L, > 0). */
  boilVolumeL: z.number().positive(),
  /** Volume mort / pertes système (L). */
  deadSpaceL: z.number().nonnegative().default(0),
  /** Température de palier visée (°C). */
  targetTempC: z.number(),
  /** Température initiale des grains (°C). */
  grainTempC: z.number(),
});
export type WaterPlanInput = z.infer<typeof waterPlanInputSchema>;

/** Entrée BIAB (§12.2) — une seule cuve, sans rinçage. */
export const biabInputSchema = z.object({
  /** Masse de grain (kg, > 0). */
  grainKg: z.number().positive(),
  /** Volume pré-ébullition visé (L, > 0). */
  boilVolumeL: z.number().positive(),
  /** Volume mort / pertes système (L). */
  deadSpaceL: z.number().nonnegative().default(0),
  /** Absorption d'eau par le grain (L/kg) ; défaut 1.0. */
  grainAbsorptionLPerKg: z.number().positive().default(1.0),
  /** Température de palier visée (°C). */
  targetTempC: z.number(),
  /** Température initiale des grains (°C). */
  grainTempC: z.number(),
});
export type BiabInput = z.infer<typeof biabInputSchema>;

/** Entrée dilution vers une densité cible (inverse de §9.3) : eau à ajouter. */
export const dilutionToTargetInputSchema = z.object({
  /** Densité actuelle (SG brute, > 1.000). */
  currentSg: z.number().gt(1),
  /** Volume actuel (L, > 0). */
  currentVolumeL: z.number().positive(),
  /** Densité cible **inférieure** à l'actuelle (l'ajout d'eau ne fait que diluer). */
  targetSg: z.number().gt(1),
});
export type DilutionToTargetInput = z.infer<typeof dilutionToTargetInputSchema>;
