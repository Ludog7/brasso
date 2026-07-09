/**
 * Plan d'eau & volumes d'un brassage (M3-01) — **assemble** les primitives
 * d'empâtage `formulas/mash.ts` (M1-08) avec les pertes d'un profil d'équipement
 * (deadspace, absorption du grain, évaporation, transfert) pour dériver les volumes
 * d'eau réels et la température de chauffe.
 *
 * SOURCE DE VÉRITÉ des formules : `docs/FORMULES-BRASSICOLES.md` §6. Fonction pure
 * (ADR-03) : rien n'est stocké, tout est re-dérivable. Unités internes (grain en
 * **kg**, volumes en L, températures en °C, ratio en L/kg).
 */

import { mashWaterVolume, strikeWaterTemp } from "../formulas/mash.js";
import { DEFAULT_MASH_RATIO } from "../units.js";

/** Paramètres d'un profil d'équipement pertinents pour le plan d'eau (unités internes). */
export interface EquipmentParams {
  /** Volume mort / pertes système de la cuve (L). */
  readonly deadspaceL: number;
  /** Pertes au transfert vers le fermenteur (L). */
  readonly transferLossL: number;
  /** Taux d'évaporation à l'ébullition (L/h). */
  readonly evaporationRateLPerHour: number;
  /** Absorption d'eau par le grain (L/kg) — propre à l'équipement/procédé. */
  readonly grainAbsorptionLPerKg: number;
  /** Volume nominal de la cuve (L) — sert à détecter un dépassement de capacité. */
  readonly nominalVolumeL?: number;
}

/** Entrée du calcul de plan d'eau (recette + équipement). */
export interface BrewWaterPlanInput {
  /** Masse totale de grain empâté (kg). */
  readonly grainKg: number;
  /** Volume final visé dans le fermenteur (L). */
  readonly batchVolumeL: number;
  /** Durée d'ébullition (min) — pilote la perte par évaporation. */
  readonly boilTimeMin: number;
  readonly equipment: EquipmentParams;
  /** Ratio eau/grain d'empâtage (L/kg) ; défaut {@link DEFAULT_MASH_RATIO}. */
  readonly mashRatioLPerKg?: number;
  /** Température de palier visée (°C) — requise avec `grainTempC` pour la strike temp. */
  readonly targetMashTempC?: number;
  /** Température initiale des grains (°C). */
  readonly grainTempC?: number;
}

/** Plan d'eau dérivé : volumes (L), pertes (L) et température de chauffe (°C). */
export interface BrewWaterPlan {
  readonly mashWaterL: number;
  readonly spargeWaterL: number;
  readonly totalWaterL: number;
  readonly preBoilVolumeL: number;
  readonly postBoilVolumeL: number;
  readonly evaporationLossL: number;
  readonly grainAbsorptionLossL: number;
  /** Température de l'eau de chauffe (°C), ou `null` si les températures manquent. */
  readonly strikeTempC: number | null;
  /** Le volume pré-ébullition dépasse la capacité nominale de la cuve. */
  readonly overCapacity: boolean;
  /** Anomalies non bloquantes (volume négatif ramené à 0, dépassement de capacité…). */
  readonly warnings: readonly string[];
}

const nonNeg = (value: number): number => (value > 0 ? value : 0);

/**
 * Dérive le plan d'eau complet d'un brassage. Aucune formule brassicole n'est
 * réécrite : l'empâtage et la strike temp viennent de `formulas/mash.ts` (M1-08) ;
 * le rinçage applique la relation FORMULES §6.2 avec l'absorption **de
 * l'équipement**. Les garde-fous sont non bloquants (volumes négatifs ramenés à 0,
 * dépassement de capacité signalé).
 */
export function computeBrewWaterPlan(input: BrewWaterPlanInput): BrewWaterPlan {
  const warnings: string[] = [];
  const { equipment: eq } = input;

  const grainKg = nonNeg(input.grainKg);
  const boilTimeMin = nonNeg(input.boilTimeMin);
  const ratio =
    input.mashRatioLPerKg != null && input.mashRatioLPerKg > 0
      ? input.mashRatioLPerKg
      : DEFAULT_MASH_RATIO;

  // Empâtage (M1-08, §6.1) et pertes.
  const mashWaterL = mashWaterVolume(grainKg, ratio);
  const grainAbsorptionLossL = nonNeg(eq.grainAbsorptionLPerKg) * grainKg;
  const evaporationLossL = nonNeg(eq.evaporationRateLPerHour) * (boilTimeMin / 60);

  // Volumes de chaudière : final + pertes au transfert, puis + évaporation.
  const postBoilVolumeL = nonNeg(input.batchVolumeL) + nonNeg(eq.transferLossL);
  const preBoilVolumeL = postBoilVolumeL + evaporationLossL;

  // Rinçage (§6.2) : sparge = préÉbullition + absorption + deadspace − empâtage.
  const rawSpargeWaterL =
    preBoilVolumeL + grainAbsorptionLossL + nonNeg(eq.deadspaceL) - mashWaterL;
  let spargeWaterL = rawSpargeWaterL;
  if (spargeWaterL < 0) {
    warnings.push(
      "Volume de rinçage négatif : l'eau d'empâtage couvre déjà le volume visé (ramené à 0).",
    );
    spargeWaterL = 0;
  }

  const strikeTempC =
    input.targetMashTempC != null && input.grainTempC != null
      ? strikeWaterTemp(ratio, input.targetMashTempC, input.grainTempC)
      : null;

  const overCapacity = eq.nominalVolumeL != null && preBoilVolumeL > eq.nominalVolumeL;
  if (overCapacity) {
    warnings.push(
      `Volume pré-ébullition (${preBoilVolumeL.toFixed(1)} L) supérieur à la capacité nominale (${eq.nominalVolumeL} L).`,
    );
  }

  return {
    mashWaterL,
    spargeWaterL,
    totalWaterL: mashWaterL + spargeWaterL,
    preBoilVolumeL,
    postBoilVolumeL,
    evaporationLossL,
    grainAbsorptionLossL,
    strikeTempC,
    overCapacity,
    warnings,
  };
}
