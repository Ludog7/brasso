/**
 * Corrections de densité **pré-ébullition** — aide à la décision (M4-02).
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md`. En cas de divergence code ↔
 * document, le document fait foi (CLAUDE.md). Formules mobilisées : §1 (points
 * d'extrait, `MAX_EXTRACT_POINTS`), §2 (FG par atténuation), §3 (ABV standard),
 * §9.3 (dilution / concentration par évaporation).
 *
 * À la mesure densité/volume avant ébullition, on compare au modèle et on propose
 * des corrections **chiffrées** avec OG/ABV **projetés**. Fonction pure (ADR-03),
 * déterministe. Wording « estimation / aide à la décision », jamais prescriptif
 * (ADR-11) — la couche UI (M4-13) porte le disclaimer.
 *
 * ## Modèle de volume
 * L'extrait présent dans la cuve est conservé pendant l'ébullition (seule l'eau
 * s'évapore) : on raisonne donc en **points·L** (`points(SG) × volume`), invariants
 * au bouillon. Le **volume final planifié** sert d'ancrage :
 *
 * ```
 * plannedEvapL       = evaporationRateLPerHour × plannedBoilTimeMin / 60
 * plannedFinalVolumeL = targetPreBoilVolumeL − plannedEvapL   // volume visé (fermenteur)
 * measuredPoints     = points(measuredGravity) × measuredVolumeL  // extrait mesuré (points·L)
 * ```
 *
 * Unités internes (CLAUDE.md) : SG brute, L, L/h, min, %.
 */

import { MAX_EXTRACT_POINTS, points, sgFromPoints } from "../units.js";
import { calcAbv } from "./abv.js";

/** Entrée de `suggestPreBoilCorrections` (unités internes). */
export interface PreBoilCorrectionInput {
  /** Densité mesurée avant ébullition (SG brute). */
  measuredGravity: number;
  /** Volume mesuré avant ébullition (L). */
  measuredVolumeL: number;
  /** Densité pré-ébullition cible du modèle (SG brute). */
  targetPreBoilGravity: number;
  /** Volume pré-ébullition cible du modèle (L). */
  targetPreBoilVolumeL: number;
  /** OG cible (post-ébullition) du modèle (SG brute). */
  targetOg: number;
  /** Taux d'évaporation de l'équipement (L/h). */
  evaporationRateLPerHour: number;
  /** Durée d'ébullition planifiée (min). */
  plannedBoilTimeMin: number;
  /** Atténuation attendue de la levure (%), pour projeter la FG puis l'ABV. */
  expectedAttenuationPct: number;
}

/** Prolonger l'ébullition : concentre le moût (évaporation, §9.3) pour viser l'OG. */
export interface ExtendBoilProposal {
  kind: "extend_boil";
  /** Durée d'ébullition **additionnelle** au-delà du planifié (min). */
  extraBoilMin: number;
  projectedOg: number;
  projectedAbv: number;
}

/** Ajouter du sucre/extrait : apporte des points d'extrait (§1) pour viser l'OG. */
export interface AddSugarProposal {
  kind: "add_sugar";
  /** Masse de sucre/extrait (base saccharose, `MAX_EXTRACT_POINTS`) à ajouter (kg). */
  sugarKg: number;
  projectedOg: number;
  projectedAbv: number;
}

/** Diluer : ajout d'eau (§9.3) pour ramener une densité **trop haute** vers la cible. */
export interface DiluteProposal {
  kind: "dilute";
  /** Volume d'eau à ajouter pour ramener la densité pré-ébullition à la cible (L). */
  waterToAddL: number;
  projectedOg: number;
  projectedAbv: number;
}

/** Proposition de correction chiffrée avec impact projeté (OG/ABV). */
export type PreBoilProposal = ExtendBoilProposal | AddSugarProposal | DiluteProposal;

/** Résultat de `suggestPreBoilCorrections` : écarts + propositions chiffrées. */
export interface PreBoilCorrection {
  /** Écart de densité mesuré − cible pré-ébullition, en **points** (négatif = sous le modèle). */
  deltaGravity: number;
  /** Écart de l'OG **projetée à volume final planifié** − OG cible, en **points**. */
  deltaOg: number;
  /** Propositions applicables (raise l'OG si densité basse ; dilution si densité haute). */
  proposals: PreBoilProposal[];
}

/** Épsilon de points pour n'émettre une proposition que si elle a un effet réel. */
const POINT_EPSILON = 1e-6;

/**
 * Projette l'ABV standard (§3) depuis une OG et l'atténuation attendue : FG par
 * atténuation apparente (§2, `FG_points = OG_points × (1 − attén)`), puis
 * `ABV = (OG − FG) × 131.25`.
 */
function projectAbv(og: number, attenuationPct: number): number {
  const fg = sgFromPoints(points(og) * (1 - attenuationPct / 100));
  return calcAbv(og, fg);
}

/**
 * Propose des corrections de densité **pré-ébullition** (M4-02).
 *
 * - **Densité basse** (`measuredGravity < targetPreBoilGravity`) : deux options
 *   pour remonter l'OG à la cible — **prolonger l'ébullition** (concentration, §9.3)
 *   et **ajouter du sucre/extrait** (§1) — chacune n'est émise que si elle a un
 *   effet positif.
 * - **Densité haute ou égale** : proposition informative de **dilution** (§9.3).
 *
 * @throws RangeError si un volume/rendement/densité rend un calcul impossible
 *   (volumes ≤ 0, densités cibles ≤ 1.000, évaporation ≤ 0, volume final ≤ 0).
 */
export function suggestPreBoilCorrections(input: PreBoilCorrectionInput): PreBoilCorrection {
  const {
    measuredGravity,
    measuredVolumeL,
    targetPreBoilGravity,
    targetPreBoilVolumeL,
    targetOg,
    evaporationRateLPerHour,
    plannedBoilTimeMin,
    expectedAttenuationPct,
  } = input;

  if (!(measuredVolumeL > 0)) {
    throw new RangeError(
      `suggestPreBoilCorrections: measuredVolumeL doit être > 0 (${measuredVolumeL}).`,
    );
  }
  if (!(evaporationRateLPerHour > 0)) {
    throw new RangeError(
      `suggestPreBoilCorrections: evaporationRateLPerHour doit être > 0 (${evaporationRateLPerHour}).`,
    );
  }
  const targetOgPoints = points(targetOg);
  const targetPreBoilPoints = points(targetPreBoilGravity);
  if (!(targetOgPoints > 0)) {
    throw new RangeError(`suggestPreBoilCorrections: targetOg doit être > 1.000 (${targetOg}).`);
  }
  if (!(targetPreBoilPoints > 0)) {
    throw new RangeError(
      `suggestPreBoilCorrections: targetPreBoilGravity doit être > 1.000 (${targetPreBoilGravity}).`,
    );
  }

  const plannedEvapL = (evaporationRateLPerHour * plannedBoilTimeMin) / 60;
  const plannedFinalVolumeL = targetPreBoilVolumeL - plannedEvapL;
  if (!(plannedFinalVolumeL > 0)) {
    throw new RangeError(
      `suggestPreBoilCorrections: volume final planifié ≤ 0 (évaporation ${plannedEvapL} L ≥ volume pré-ébullition ${targetPreBoilVolumeL} L).`,
    );
  }

  // Extrait mesuré, invariant au bouillon (points·L).
  const measuredPoints = points(measuredGravity) * measuredVolumeL;
  const deltaGravity = points(measuredGravity) - targetPreBoilPoints;

  // OG projetée « sans rien faire », au volume final planifié.
  const projectedOgAsIs = sgFromPoints(measuredPoints / plannedFinalVolumeL);
  const deltaOg = points(projectedOgAsIs) - targetOgPoints;

  const proposals: PreBoilProposal[] = [];

  if (deltaGravity < 0) {
    // Densité basse → remonter l'OG vers la cible.

    // Prolonger l'ébullition : concentrer jusqu'au volume donnant la cible (§9.3).
    const targetVolumeL = measuredPoints / targetOgPoints;
    const extraEvapL = plannedFinalVolumeL - targetVolumeL;
    if (extraEvapL > 0) {
      const extraBoilMin = (extraEvapL / evaporationRateLPerHour) * 60;
      const projectedOg = sgFromPoints(measuredPoints / targetVolumeL);
      proposals.push({
        kind: "extend_boil",
        extraBoilMin,
        projectedOg,
        projectedAbv: projectAbv(projectedOg, expectedAttenuationPct),
      });
    }

    // Ajouter du sucre/extrait : combler le déficit de points au volume final (§1).
    const deficitPoints = targetOgPoints * plannedFinalVolumeL - measuredPoints;
    if (deficitPoints > POINT_EPSILON) {
      const sugarKg = deficitPoints / MAX_EXTRACT_POINTS;
      const projectedOg = sgFromPoints(
        (measuredPoints + sugarKg * MAX_EXTRACT_POINTS) / plannedFinalVolumeL,
      );
      proposals.push({
        kind: "add_sugar",
        sugarKg,
        projectedOg,
        projectedAbv: projectAbv(projectedOg, expectedAttenuationPct),
      });
    }
  } else {
    // Densité haute ou égale → dilution informative (ajout d'eau, §9.3).
    const dilutedVolumeL = measuredPoints / targetPreBoilPoints;
    const waterToAddL = dilutedVolumeL - measuredVolumeL;
    // Après dilution puis ébullition planifiée : volume final = dilutedVolumeL − évaporation.
    const finalVolumeL = dilutedVolumeL - plannedEvapL;
    const projectedOg =
      finalVolumeL > 0 ? sgFromPoints(measuredPoints / finalVolumeL) : projectedOgAsIs;
    proposals.push({
      kind: "dilute",
      waterToAddL,
      projectedOg,
      projectedAbv: projectAbv(projectedOg, expectedAttenuationPct),
    });
  }

  return { deltaGravity, deltaOg, proposals };
}
