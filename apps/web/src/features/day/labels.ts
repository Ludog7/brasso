/**
 * Libellés d'affichage du Jour J (M4-08). Les phases côté persistance (Prisma
 * `DayPhase`) sont déjà en français ; on les rend simplement lisibles à l'écran.
 */

import type { DayPhase, HopAdditionNature, MeasurementKind, Phase } from "@brasso/core";

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

/**
 * Libellé lisible de la nature d'un ajout de houblon (M9-11). Le **hors-flamme**
 * porte un libellé qui lui est propre : c'est le seul ajout qui s'accompagne
 * d'un geste sur le feu, et le confondre avec le dernier aromatique change le
 * profil de la bière.
 */
export const HOP_NATURE_LABELS: Record<HopAdditionNature, string> = {
  BITTERING: "Amérisant",
  AROMA: "Aromatique",
  FLAME_OUT: "Hors-flamme",
};

/** Consigne du geste à faire, par nature d'ajout — lue à distance, sur tablette. */
export const HOP_NATURE_ACTIONS: Record<HopAdditionNature, string> = {
  BITTERING: "Ajoute le houblon amérisant.",
  AROMA: "Ajoute le houblon aromatique.",
  FLAME_OUT: "Coupe le feu, puis ajoute le houblon hors-flamme.",
};
