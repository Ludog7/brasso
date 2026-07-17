/**
 * Calculateur de **dilution** autonome (M8-01) — FORMULES §9.3.
 *
 * Réutilise `dilute` (densité après ajout d'eau, `../formulas/postmortem.js`) et en
 * fournit l'**inverse** : le volume d'eau à ajouter pour atteindre une densité cible.
 * Pur (ADR-03) ; conversions via `units.ts`. SG brute, volumes en L.
 */

import type { DilutionToTargetInput } from "../schemas/calculators.js";
import { points } from "../units.js";

/** Résultat de dilution vers une cible : volume final et eau à ajouter (L). */
export interface DilutionToTargetResult {
  finalVolumeL: number;
  waterToAddL: number;
}

/**
 * Eau à ajouter pour **abaisser** `currentSg` (volume `currentVolumeL`) jusqu'à
 * `targetSg` — inverse de §9.3. À masse d'extrait constante :
 * `V2 = points(SG1) × V1 / points(SG2)`, puis `eau = V2 − V1`.
 *
 * @throws RangeError si `targetSg ≥ currentSg` (l'ajout d'eau ne peut que diluer) ou
 *   si `points(targetSg) ≤ 0` (cible ≤ 1.000, division interdite).
 */
export function dilutionWaterToTarget(input: DilutionToTargetInput): DilutionToTargetResult {
  const { currentSg, currentVolumeL, targetSg } = input;
  if (!(targetSg < currentSg)) {
    throw new RangeError(
      `dilutionWaterToTarget: targetSg (${targetSg}) doit être < currentSg (${currentSg}) — l'ajout d'eau ne fait que diluer.`,
    );
  }
  const targetPoints = points(targetSg);
  if (!(targetPoints > 0)) {
    throw new RangeError(
      `dilutionWaterToTarget: targetSg (${targetSg}) doit être > 1.000 — division interdite.`,
    );
  }
  const finalVolumeL = (points(currentSg) * currentVolumeL) / targetPoints;
  return { finalVolumeL, waterToAddL: finalVolumeL - currentVolumeL };
}
