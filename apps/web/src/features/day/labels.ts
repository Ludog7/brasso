/**
 * Libellés d'affichage du Jour J (M4-08). Les phases côté persistance (Prisma
 * `DayPhase`) sont déjà en français ; on les rend simplement lisibles à l'écran.
 */

import type { DayPhase } from "@brasso/core";

/** Libellé lisible d'une phase Jour J. */
export const DAY_PHASE_LABELS: Record<DayPhase, string> = {
  INITIALISATION: "Initialisation",
  EMPATAGE: "Empâtage",
  FILTRATION: "Filtration",
  EBULLITION: "Ébullition",
  REFROIDISSEMENT: "Refroidissement",
  ENSEMENCEMENT: "Ensemencement",
  TERMINE: "Terminé",
};
