/**
 * Moteur SOFT_DRINK (limonades non fermentées, boissons sucrées sans alcool).
 *
 * Pas d'ABV/IBU/EBC. Variables clés : concentration en sucre, pH, mode de
 * conservation ; stabilisation si nécessaire. Pur (ADR-03).
 *
 * ADR-11 : pH = indicateur d'aide à la décision, jamais « conforme ».
 */

import type { SoftRecipe } from "../schemas/recipe.js";
import {
  PH_LOW_ACID_THRESHOLD,
  type PhIndicator,
  phIndicator,
  type PublicationCheck,
} from "./common.js";
import { recipePublicationCheck } from "./publication.js";

/** Indicateurs d'une recette SOFT_DRINK (pas d'ABV/IBU/EBC). */
export interface SoftResult {
  readonly engine: "SOFT_DRINK";
  readonly sugarConcentrationGPerL: number | null;
  readonly ph: PhIndicator | null;
  readonly storageMode: "cold" | "ambient" | null;
  /** Stabilisation requise : stockage ambiant à pH > 4.6 (indicateur sécurité). */
  readonly stabilizationRequired: boolean;
  readonly publication: PublicationCheck;
}

/**
 * Calcule les indicateurs d'une recette SOFT_DRINK.
 *
 * Publication (règles `core`) : pH obligatoire ; si stockage ambiant à pH > 4.6,
 * une stabilisation est requise pour publier (§ sécurité microbiologique).
 */
export function computeSoftDrink(recipe: SoftRecipe): SoftResult {
  const ph = recipe.ph === undefined ? null : phIndicator(recipe.ph);
  const ambient = recipe.storageMode === "ambient";
  const lowAcid = recipe.ph !== undefined && recipe.ph > PH_LOW_ACID_THRESHOLD;
  const stabilizationRequired = ambient && lowAcid;

  return {
    engine: "SOFT_DRINK",
    sugarConcentrationGPerL: recipe.sugarConcentrationGPerL ?? null,
    ph,
    storageMode: recipe.storageMode ?? null,
    stabilizationRequired,
    publication: recipePublicationCheck({
      engine: "SOFT_DRINK",
      ph: recipe.ph ?? null,
      storageMode: recipe.storageMode ?? null,
      stabilizationMethod: recipe.stabilizationMethod ?? null,
    }),
  };
}
