/**
 * Empâtage & eau — volume d'empâtage, strike temp, rinçage (sparge), infusion.
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §6. En cas de divergence code ↔
 * document, le document fait foi (CLAUDE.md).
 *
 * Alimente le profil matériel & moteur thermique (M3) et la State Machine Jour J
 * (M1-13) : temps de montée, strike temp. Fonctions pures (ADR-03).
 *
 * Unités (CLAUDE.md) : masse de grain en **kg**, volumes en L, températures en °C,
 * ratio eau/grain en L/kg. Les constantes vivent dans `units.ts` (Annexe B).
 */

import { DEFAULT_MASH_RATIO, GRAIN_ABSORPTION, MASH_HEAT_RATIO } from "../units.js";

/** Température de l'eau bouillante au niveau de la mer (°C), défaut d'infusion. */
export const WATER_BOILING_C = 100;

/**
 * Volume d'eau d'empâtage (L) — FORMULES §6.1 : `ratio × masseGrainsKg`.
 *
 * @param grainKg masse de grain (kg).
 * @param ratio   ratio eau/grain (L/kg). Plage usuelle 2.5–4.0 ; défaut 3.0.
 * @returns volume d'eau d'empâtage (L).
 */
export function mashWaterVolume(grainKg: number, ratio: number = DEFAULT_MASH_RATIO): number {
  return ratio * grainKg;
}

/**
 * Température de l'eau de chauffe (strike) — FORMULES §6.3.
 *
 * `Tstrike = (0.41 / R) × (Tcible − Tgrain) + Tcible`.
 *
 * @param ratio   ratio eau/grain R (L/kg) ; doit être > 0.
 * @param targetC température de palier visée (°C).
 * @param grainC  température initiale des grains (°C).
 * @returns température de l'eau de chauffe (°C).
 * @throws RangeError si `ratio ≤ 0` (division interdite).
 */
export function strikeWaterTemp(ratio: number, targetC: number, grainC: number): number {
  if (!(ratio > 0)) {
    throw new RangeError(
      `strikeWaterTemp: ratio doit être > 0 (reçu ${ratio}) — division interdite.`,
    );
  }
  return (MASH_HEAT_RATIO / ratio) * (targetC - grainC) + targetC;
}

/**
 * Volume d'eau de rinçage (sparge, L) — FORMULES §6.2.
 *
 * `sparge = volPreBoil + absorption + pertesMort − eauEmpatage`, avec
 * `absorption = GRAIN_ABSORPTION × grainKg` (eau retenue par la drêche).
 *
 * @param boilVolumeL volume pré-ébullition visé (L).
 * @param grainKg     masse de grain (kg).
 * @param mashWaterL  eau d'empâtage déjà utilisée (L).
 * @param deadSpaceL  pertes du système / dead space (L) ; défaut 0.
 * @returns volume d'eau de rinçage (L).
 */
export function spargeVolume(
  boilVolumeL: number,
  grainKg: number,
  mashWaterL: number,
  deadSpaceL = 0,
): number {
  const absorption = GRAIN_ABSORPTION * grainKg;
  return boilVolumeL + absorption + deadSpaceL - mashWaterL;
}

/**
 * Volume d'eau bouillante à infuser pour un changement de palier — FORMULES §6.4.
 *
 * `Veau = (Tcible − Tactuel) × (0.41 × grainKg + VeauActuelleL) / (Tbouillante − Tcible)`.
 *
 * @param targetC       température de palier visée (°C).
 * @param currentC      température actuelle de la maische (°C).
 * @param grainKg       masse de grain (kg).
 * @param currentWaterL volume d'eau actuellement dans la maische (L).
 * @param boilingC      température de l'eau infusée (°C) ; défaut {@link WATER_BOILING_C}.
 * @returns volume d'eau bouillante à ajouter (L).
 * @throws RangeError si `boilingC ≤ targetC` (division interdite / infusion impossible).
 */
export function infusionVolume(
  targetC: number,
  currentC: number,
  grainKg: number,
  currentWaterL: number,
  boilingC: number = WATER_BOILING_C,
): number {
  if (!(boilingC > targetC)) {
    throw new RangeError(
      `infusionVolume: boilingC (${boilingC}) doit être > targetC (${targetC}) — infusion impossible.`,
    );
  }
  return (
    ((targetC - currentC) * (MASH_HEAT_RATIO * grainKg + currentWaterL)) / (boilingC - targetC)
  );
}
