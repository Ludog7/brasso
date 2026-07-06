/**
 * Moteurs de calcul par type de boisson (M1-12) — dispatcher + ré-exports.
 *
 * Chaque moteur est une fonction pure (ADR-03) prenant une recette et renvoyant
 * ses indicateurs + la validation de publication `core`. Le moteur est sélectionné
 * par le discriminant `engine` (ADR-06).
 */

import type { RecipeInput } from "../schemas/recipe.js";
import { type AltResult, computeAltFermented } from "./altFermented.js";
import { type BeerResult, computeBeer } from "./beer.js";
import { computeSoftDrink, type SoftResult } from "./softDrink.js";

export * from "./altFermented.js";
export * from "./beer.js";
export * from "./common.js";
export * from "./publication.js";
export * from "./softDrink.js";

/** Résultat d'un moteur, discriminé par `engine`. */
export type RecipeResult = BeerResult | AltResult | SoftResult;

/** Sélectionne et exécute le moteur correspondant au type de boisson (ADR-06). */
export function computeRecipe(recipe: RecipeInput): RecipeResult {
  switch (recipe.engine) {
    case "BEER":
      return computeBeer(recipe);
    case "ALT_FERMENTED":
      return computeAltFermented(recipe);
    case "SOFT_DRINK":
      return computeSoftDrink(recipe);
  }
}
