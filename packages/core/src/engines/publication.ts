/**
 * Règles de publication `core` (ADR-06) — **source unique** partagée par les
 * moteurs (indicateurs calculés) et par l'API (transition `DRAFT → PUBLISHED`).
 *
 * Opère sur les seuls champs pertinents pour la publication, indépendamment de
 * la forme de calcul de chaque moteur : le persistant (API) comme les recettes
 * d'entrée moteur peuvent l'appeler. Pur (ADR-03).
 *
 * ADR-11 : les motifs parlent d'**indicateur** sécurité, jamais de « conforme ».
 */

import type { RecipeEngine } from "../schemas/enums.js";
import type { StabilizationMethod } from "../schemas/recipe.js";
import { PH_LOW_ACID_THRESHOLD, type PublicationCheck } from "./common.js";

export const ALT_PH_REQUIRED = "pH obligatoire pour publier une recette ALT (indicateur sécurité).";
export const ALT_STABILIZATION_REQUIRED =
  "Stabilisation obligatoire pour publier une recette ALT (ADR-06).";
export const SOFT_PH_REQUIRED =
  "pH obligatoire pour publier une recette SOFT (indicateur sécurité).";
export const SOFT_STABILIZATION_REQUIRED =
  "Stabilisation requise pour un stockage ambiant à pH > 4.6 (indicateur sécurité).";

/** Champs d'une recette pertinents pour la validation de publication `core`. */
export interface RecipePublicationInput {
  readonly engine: RecipeEngine;
  /** pH cible/mesuré (obligatoire pour publier ALT & SOFT). */
  readonly ph?: number | null;
  /** Mode de conservation (SOFT : conditionne l'exigence de stabilisation). */
  readonly storageMode?: "cold" | "ambient" | null;
  /** Méthode de stabilisation ; seule sa présence est évaluée. */
  readonly stabilizationMethod?: StabilizationMethod | null;
}

/**
 * Applique les règles de publication `core` :
 * - **ALT_FERMENTED** : pH **et** méthode de stabilisation obligatoires (ADR-06) ;
 * - **SOFT_DRINK** : pH obligatoire ; stabilisation requise si stockage ambiant à
 *   pH > 4.6 (§ sécurité microbiologique) ;
 * - **BEER** : aucune règle de publication `core`.
 */
export function recipePublicationCheck(input: RecipePublicationInput): PublicationCheck {
  const errors: string[] = [];
  switch (input.engine) {
    case "ALT_FERMENTED":
      if (input.ph == null) {
        errors.push(ALT_PH_REQUIRED);
      }
      if (input.stabilizationMethod == null) {
        errors.push(ALT_STABILIZATION_REQUIRED);
      }
      break;
    case "SOFT_DRINK": {
      if (input.ph == null) {
        errors.push(SOFT_PH_REQUIRED);
      }
      const ambient = input.storageMode === "ambient";
      const lowAcid = input.ph != null && input.ph > PH_LOW_ACID_THRESHOLD;
      if (ambient && lowAcid && input.stabilizationMethod == null) {
        errors.push(SOFT_STABILIZATION_REQUIRED);
      }
      break;
    }
    case "BEER":
      break;
  }
  return { publishable: errors.length === 0, errors };
}
