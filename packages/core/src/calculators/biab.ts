/**
 * Calculateur **BIAB** autonome (M8-01) — FORMULES §12.2.
 *
 * Brassage « une seule cuve », **sans rinçage** : toute l'eau tient dans la cuve.
 * `eauTotale = volPreBoil + absorption + volumeMort`, `ratio = eauTotale / grain`,
 * température de chauffe via §6.3. Pur (ADR-03). Masse en kg, volumes en L, °C.
 */

import { strikeWaterTemp } from "../formulas/mash.js";
import type { BiabInput } from "../schemas/calculators.js";

/** Plan BIAB : eau totale, eau absorbée, ratio (maische fine) et température de chauffe. */
export interface BiabResult {
  totalWaterL: number;
  absorptionL: number;
  mashRatioLPerKg: number;
  strikeTempC: number;
}

/**
 * Plan d'eau BIAB : `absorption = grainAbsorption × grain`,
 * `eauTotale = volPreBoil + absorption + deadSpace`, `ratio = eauTotale / grain`,
 * `strike = (0.41 / ratio) × (Tcible − Tgrain) + Tcible`.
 */
export function computeBiab(input: BiabInput): BiabResult {
  const { grainKg, boilVolumeL, deadSpaceL, grainAbsorptionLPerKg, targetTempC, grainTempC } =
    input;
  const absorptionL = grainAbsorptionLPerKg * grainKg;
  const totalWaterL = boilVolumeL + absorptionL + deadSpaceL;
  const mashRatioLPerKg = totalWaterL / grainKg;
  const strikeTempC = strikeWaterTemp(mashRatioLPerKg, targetTempC, grainTempC);
  return { totalWaterL, absorptionL, mashRatioLPerKg, strikeTempC };
}
