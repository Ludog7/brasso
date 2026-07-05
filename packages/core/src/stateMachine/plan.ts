/**
 * Plan du Jour J — phases canoniques et construction du modèle par défaut.
 *
 * Le plan est **de la donnée** (liste ordonnée de {@link StepSpec}) : c'est le
 * point d'extension (multi-paliers, capteurs IoT, types de boisson) sans toucher
 * au cœur de la machine. Pur (ADR-03).
 */

import type { DayPlan, Phase, StepSpec } from "./types.js";

/** Ordre canonique des phases du Jour J (spec « Structure des étapes »). */
export const CANONICAL_PHASES: readonly Phase[] = [
  "INITIALIZATION",
  "MASH",
  "LAUTER",
  "BOIL",
  "COOLING",
  "PITCHING",
] as const;

/**
 * Plan par défaut : une étape par phase canonique. `MASH`, `BOIL` et `COOLING`
 * exigent une **stabilisation** (température cible) avant d'armer leur timer de
 * palier ; `INITIALIZATION`, `LAUTER` et `PITCHING` sont de simples jalons à
 * valider. Les durées/températures sont des exemples, surchargées par la recette.
 *
 * @param overrides fusion partielle par `id` (ex. durées issues du profil matériel).
 * @returns un plan des 6 phases canoniques.
 */
export function defaultDayPlan(
  overrides: Readonly<Record<string, Partial<StepSpec>>> = {},
): DayPlan {
  const base: readonly StepSpec[] = [
    { id: "init", phase: "INITIALIZATION", label: "Initialisation", requiresStabilization: false },
    {
      id: "mash",
      phase: "MASH",
      label: "Empâtage / Macération",
      requiresStabilization: true,
      plannedHoldMin: 60,
      plannedRampMin: 15,
      targetTempC: 66,
      requiredMeasurements: ["temperature"],
    },
    {
      id: "lauter",
      phase: "LAUTER",
      label: "Filtration / Pré-ébullition",
      requiresStabilization: false,
      requiredMeasurements: ["density", "volume"],
    },
    {
      id: "boil",
      phase: "BOIL",
      label: "Ébullition / Chauffe",
      requiresStabilization: true,
      plannedHoldMin: 60,
      plannedRampMin: 20,
      targetTempC: 100,
    },
    {
      id: "cooling",
      phase: "COOLING",
      label: "Refroidissement",
      requiresStabilization: true,
      targetTempC: 20,
      requiredMeasurements: ["temperature"],
    },
    { id: "pitching", phase: "PITCHING", label: "Ensemencement", requiresStabilization: false },
  ];

  return base.map((step) => {
    const override = overrides[step.id];
    return override ? { ...step, ...override } : step;
  });
}
