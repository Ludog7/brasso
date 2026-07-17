/**
 * Calculateur de **starter / taux d'inoculation** levure (M8-01) — FORMULES §12.1.
 *
 * Cellules requises `= tauxInoc × V(L) × °P` (en milliards), cellules disponibles depuis
 * les unités de levure × viabilité, puis déficit et taille de pied de cuve recommandée
 * (plafond stir-plate prudent). **Aide à la décision** (ADR-11) : la croissance réelle
 * dépend de l'oxygénation et de la souche. Pur (ADR-03).
 */

import type { StarterInput, StarterStyle } from "../schemas/calculators.js";
import { sgToPlato } from "../units.js";

/** Taux d'inoculation de référence (M cellules/mL/°P) — FORMULES §12.1. */
export const PITCH_RATE_ALE = 0.75;
export const PITCH_RATE_LAGER = 1.5;
/** Plafond prudent de densité cellulaire d'un starter agité (×10⁹ cellules/L). */
export const STARTER_STIR_PLATE_CELLS_PER_L = 200;

/** Taux d'inoculation de référence pour un style. */
export function pitchRateForStyle(style: StarterStyle): number {
  return style === "lager" ? PITCH_RATE_LAGER : PITCH_RATE_ALE;
}

/** Résultat du calcul de starter (cellules en milliards ×10⁹, volumes en L). */
export interface StarterResult {
  /** Degrés Plato du moût (dérivés de l'OG, §0.1). */
  platoOfWort: number;
  /** Taux d'inoculation retenu (M cellules/mL/°P). */
  pitchRate: number;
  /** Cellules requises (×10⁹). */
  cellsRequiredB: number;
  /** Cellules disponibles (×10⁹) = unités × cellules/unité × viabilité. */
  cellsAvailableB: number;
  /** Déficit (×10⁹), borné à ≥ 0. */
  deficitB: number;
  /** Pied de cuve recommandé (L) pour combler le déficit ; 0 si aucun. */
  recommendedStarterL: number;
}

/**
 * Calcule le besoin en levure et le pied de cuve recommandé (§12.1). Le taux
 * d'inoculation vient de `pitchRate` s'il est fourni, sinon du `style`.
 */
export function computeStarter(input: StarterInput): StarterResult {
  const { og, volumeL, style, pitchRate, packs, cellsPerPackB, viability } = input;
  const platoOfWort = sgToPlato(og);
  const rate = pitchRate ?? pitchRateForStyle(style);

  const cellsRequiredB = rate * volumeL * platoOfWort;
  const cellsAvailableB = packs * cellsPerPackB * viability;
  const deficitB = Math.max(0, cellsRequiredB - cellsAvailableB);
  const recommendedStarterL = deficitB > 0 ? deficitB / STARTER_STIR_PLATE_CELLS_PER_L : 0;

  return {
    platoOfWort,
    pitchRate: rate,
    cellsRequiredB,
    cellsAvailableB,
    deficitB,
    recommendedStarterL,
  };
}
