/**
 * Post-mortem brassin — rendement réel, atténuation réelle, dilution, blending.
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §9. En cas de divergence code ↔
 * document, le document fait foi (CLAUDE.md).
 *
 * Calculs a posteriori après mesures réelles d'un batch (analyse process M4, coût
 * de revient M5). Fonctions pures (ADR-03). Densités en SG brute, volumes en L.
 * Les calculs passent par les points de densité (`points`/`sgFromPoints` de units).
 */

import { gToKg, points, sgFromPoints } from "../units.js";
import type { Fermentable } from "./gravity.js";

/**
 * Rendement de brassage réel (%) — FORMULES §9.1.
 *
 * `100 × pointsObtenus / pointsThéoriques`, avec `pointsThéoriques = Σ
 * points(potentialSg) × massKg` (potentiel à 100 %) et `pointsObtenus =
 * OG_points_mesuré × batchVolumeL`.
 *
 * @param fermentables grist réellement utilisé.
 * @param ogMeasured   OG réellement mesurée (SG brute).
 * @param batchVolumeL volume réel obtenu (L).
 * @returns rendement réel en pourcentage.
 * @throws RangeError si le potentiel théorique est nul (grist vide, division interdite).
 */
export function realEfficiency(
  fermentables: readonly Fermentable[],
  ogMeasured: number,
  batchVolumeL: number,
): number {
  let theoreticalPoints = 0;
  for (const f of fermentables) {
    theoreticalPoints += points(f.potentialSg) * gToKg(f.amountG);
  }

  if (!(theoreticalPoints > 0)) {
    throw new RangeError(
      "realEfficiency: potentiel théorique nul (grist vide ?) — division interdite.",
    );
  }

  const obtainedPoints = points(ogMeasured) * batchVolumeL;
  return (100 * obtainedPoints) / theoreticalPoints;
}

/**
 * Atténuation apparente réelle (%) — FORMULES §9.2.
 *
 * `100 × (OG_points − FG_points) / OG_points`.
 *
 * @param ogMeasured OG mesurée (SG brute).
 * @param fgMeasured FG mesurée (SG brute).
 * @returns atténuation réelle en pourcentage.
 * @throws RangeError si `OG_points ≤ 0` (OG ≤ 1.000, division interdite).
 */
export function realAttenuation(ogMeasured: number, fgMeasured: number): number {
  const ogPoints = points(ogMeasured);
  if (!(ogPoints > 0)) {
    throw new RangeError(
      `realAttenuation: OG_points doit être > 0 (OG ${ogMeasured} ≤ 1.000) — division interdite.`,
    );
  }
  return (100 * (ogPoints - points(fgMeasured))) / ogPoints;
}

/**
 * Densité après ajustement de volume (dilution / concentration) — FORMULES §9.3.
 *
 * `SG2 = 1 + (points(SG1) × V1 / V2) / 1000`.
 *
 * @param sg1 densité initiale (SG brute).
 * @param v1  volume initial (L).
 * @param v2  volume final (L) ; doit être > 0.
 * @returns densité finale (SG brute).
 * @throws RangeError si `v2 ≤ 0` (division interdite).
 */
export function dilute(sg1: number, v1: number, v2: number): number {
  if (!(v2 > 0)) {
    throw new RangeError(`dilute: v2 doit être > 0 (reçu ${v2}) — division interdite.`);
  }
  return sgFromPoints((points(sg1) * v1) / v2);
}

/**
 * Densité du mélange de deux moûts / bières (blending) — FORMULES §9.4.
 *
 * `pointsMix = (points(SG_a)×V_a + points(SG_b)×V_b) / (V_a + V_b)`.
 *
 * @param sgA densité du lot A (SG brute).
 * @param vA  volume du lot A (L).
 * @param sgB densité du lot B (SG brute).
 * @param vB  volume du lot B (L).
 * @returns densité du mélange (SG brute).
 * @throws RangeError si `V_a + V_b ≤ 0` (division interdite).
 */
export function blend(sgA: number, vA: number, sgB: number, vB: number): number {
  const totalVolume = vA + vB;
  if (!(totalVolume > 0)) {
    throw new RangeError(
      `blend: le volume total doit être > 0 (reçu ${totalVolume}) — division interdite.`,
    );
  }
  return sgFromPoints((points(sgA) * vA + points(sgB) * vB) / totalVolume);
}
