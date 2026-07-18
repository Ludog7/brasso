/**
 * Libellés d'affichage du Jour J (M4-08). Les phases côté persistance (Prisma
 * `DayPhase`) sont déjà en français ; on les rend simplement lisibles à l'écran.
 */

import type { DayPhase, MeasurementKind, Phase } from "@brasso/core";

/** Libellé lisible d'une phase Jour J. */
export const DAY_PHASE_LABELS: Record<DayPhase, string> = {
  INITIALISATION: "Initialisation",
  EMPATAGE: "Empâtage",
  FILTRATION: "Filtration",
  EBULLITION: "Ébullition",
  WHIRLPOOL: "Whirlpool",
  REFROIDISSEMENT: "Refroidissement",
  ENSEMENCEMENT: "Ensemencement",
  TERMINE: "Terminé",
};

/**
 * Libellé lisible d'une **phase canonique** de la state machine (`Phase`, M1-13,
 * en anglais). Sert au fil de progression du dérouleur (M4-09), qui raisonne sur
 * les phases des étapes du plan et non sur la phase Prisma persistée.
 */
export const PHASE_LABELS: Record<Phase, string> = {
  INITIALIZATION: "Initialisation",
  MASH: "Empâtage",
  LAUTER: "Filtration",
  BOIL: "Ébullition",
  WHIRLPOOL: "Whirlpool",
  COOLING: "Refroidissement",
  PITCHING: "Ensemencement",
};

/** Libellé lisible d'un type de mesure (M4-11). */
export const MEASUREMENT_LABELS: Record<MeasurementKind, string> = {
  density: "Densité",
  volume: "Volume",
  temperature: "Température",
  ph: "pH",
};
