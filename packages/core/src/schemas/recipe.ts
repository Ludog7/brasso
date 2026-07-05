/**
 * Types d'entrée des recettes par moteur (ADR-06 : polymorphisme par moteur).
 *
 * Ces interfaces décrivent la recette telle que consommée par les moteurs `core`
 * (M1-12) — indépendantes de la DB/UI (ADR-03). La validation Zod partagée et la
 * dérivation depuis Prisma viennent en M1-14 / M2.
 *
 * Unités internes (CLAUDE.md) : masse en g, volume en L, densité en SG brute,
 * couleur en EBC, acides alpha en fraction, pH sans unité.
 */

import type { HopAddition } from "../formulas/ibu.js";

/** Fermentescible d'une recette : potentiel de densité, couleur, empâtage. */
export interface RecipeFermentable {
  /** Potentiel d'extrait en SG brute (ex. 1.037). */
  readonly potentialSg: number;
  /** Masse en grammes. */
  readonly amountG: number;
  /** Grain empâté (rendement appliqué) vs sucre/extrait à 100 %. */
  readonly isMashable: boolean;
  /** Couleur en EBC. */
  readonly colorEbc: number;
}

/** Plage BJCP d'un style — bornes indicatives des jauges (toutes optionnelles). */
export interface BjcpRange {
  readonly ogMin?: number;
  readonly ogMax?: number;
  readonly fgMin?: number;
  readonly fgMax?: number;
  readonly ibuMin?: number;
  readonly ibuMax?: number;
  readonly ebcMin?: number;
  readonly ebcMax?: number;
}

/** Méthode de stabilisation (aligné sur l'enum Prisma `StabilizationMethod`). */
export type StabilizationMethod =
  "PASTEURIZATION" | "THERMAL" | "COLD_CHAIN" | "FILTRATION_ACIDIFICATION" | "CHEMICAL" | "OTHER";

/** Mode de conservation d'une boisson non/faiblement alcoolisée. */
export type StorageMode = "cold" | "ambient";

/** Recette moteur BEER (§ spec « Moteurs de calcul »). */
export interface BeerRecipe {
  readonly engine: "BEER";
  readonly fermentables: readonly RecipeFermentable[];
  readonly hops: readonly HopAddition[];
  /** Rendement de brassage (%). */
  readonly efficiencyPct: number;
  /** Volume final visé (L). */
  readonly batchVolumeL: number;
  /** Volume en début d'ébullition (L). */
  readonly boilVolumeL: number;
  /** Atténuation apparente de la levure dominante (%). */
  readonly yeastAttenuationPct: number;
  /** Plage BJCP du style visé (jauges). */
  readonly style?: BjcpRange;
}

/**
 * Recette moteur ALT_FERMENTED (ginger beer, hydromel, kombucha…).
 * OG/FG mesurées ou visées (pas de grist malté) ; IBU/EBC non pertinents.
 */
export interface AltRecipe {
  readonly engine: "ALT_FERMENTED";
  /** OG (SG brute). */
  readonly og: number;
  /** FG (SG brute). */
  readonly fg: number;
  /** pH mesuré (imposé pour publier). */
  readonly ph?: number;
  /** Méthode de stabilisation (obligatoire pour publier — ADR-06). */
  readonly stabilizationMethod?: StabilizationMethod | null;
  /** Mode de conservation. */
  readonly storageMode?: StorageMode;
  /** Température la plus haute atteinte (°C), pour le CO₂ résiduel. */
  readonly maxTempC?: number;
  /** Présence de sucre résiduel fermentescible (risque de surpression). */
  readonly residualSugarRisk?: boolean;
  /** Volume (L). */
  readonly batchVolumeL?: number;
}

/** Recette moteur SOFT_DRINK (limonades non fermentées). Pas d'ABV/IBU/EBC. */
export interface SoftRecipe {
  readonly engine: "SOFT_DRINK";
  /** Concentration en sucre (g/L). */
  readonly sugarConcentrationGPerL?: number;
  /** pH mesuré (imposé pour publier). */
  readonly ph?: number;
  /** Mode de conservation (froid / ambiant). */
  readonly storageMode?: StorageMode;
  /** Méthode de stabilisation. */
  readonly stabilizationMethod?: StabilizationMethod | null;
}

/** Recette d'entrée, discriminée par `engine` (ADR-06). */
export type RecipeInput = BeerRecipe | AltRecipe | SoftRecipe;
