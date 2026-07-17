/**
 * Calculateur d'**eau** autonome (M8-01) — FORMULES §6.1/6.2/6.3.
 *
 * Compose les primitives d'empâtage (`../formulas/mash.js`) en un plan d'eau complet
 * (empâtage + rinçage + strike) à partir de paramètres **saisis à la main** (sans
 * profil d'équipement). Pur (ADR-03). Masse en kg, volumes en L, températures en °C.
 */

import { mashWaterVolume, spargeVolume, strikeWaterTemp } from "../formulas/mash.js";
import type { WaterPlanInput } from "../schemas/calculators.js";

/** Plan d'eau : empâtage, rinçage, total et température de chauffe. */
export interface WaterPlanResult {
  mashWaterL: number;
  /** Rinçage (§6.2). Peut être ≤ 0 si l'empâtage couvre déjà le besoin (→ pas de sparge). */
  spargeWaterL: number;
  totalWaterL: number;
  strikeTempC: number;
}

/**
 * Plan d'eau d'un empâtage : `mashWater = ratio × grain` (§6.1),
 * `sparge = boilVolume + absorption + deadSpace − mashWater` (§6.2),
 * `strike = (0.41 / ratio) × (Tcible − Tgrain) + Tcible` (§6.3).
 */
export function computeWaterPlan(input: WaterPlanInput): WaterPlanResult {
  const { grainKg, mashRatioLPerKg, boilVolumeL, deadSpaceL, targetTempC, grainTempC } = input;
  const mashWaterL = mashWaterVolume(grainKg, mashRatioLPerKg);
  const spargeWaterL = spargeVolume(boilVolumeL, grainKg, mashWaterL, deadSpaceL);
  const strikeTempC = strikeWaterTemp(mashRatioLPerKg, targetTempC, grainTempC);
  return { mashWaterL, spargeWaterL, totalWaterL: mashWaterL + spargeWaterL, strikeTempC };
}
