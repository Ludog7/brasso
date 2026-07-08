/**
 * Pont {@link BeerXmlRecipe} → {@link BeerRecipe} : dérive l'entrée pure consommée
 * par `computeBeer`. L'atténuation de la première levure sert d'atténuation
 * dominante ; à défaut, une valeur par défaut plausible est utilisée.
 */

import type { HopAddition } from "../formulas/ibu.js";
import type { BeerRecipe, RecipeFermentable } from "../schemas/recipe.js";
import { isMashableType } from "./mapping.js";
import type { BeerXmlRecipe } from "./types.js";

/** Atténuation apparente par défaut (%) si la recette ne déclare aucune levure. */
const DEFAULT_ATTENUATION_PCT = 75;

/** Dérive l'entrée moteur BEER d'une recette BeerXML importée. */
export function beerXmlToBeerRecipe(recipe: BeerXmlRecipe): BeerRecipe {
  const fermentables: RecipeFermentable[] = recipe.fermentables.map((f) => ({
    potentialSg: f.potentialSg,
    amountG: f.amountG,
    isMashable: isMashableType(f.type),
    colorEbc: f.colorEbc,
  }));

  const hops: HopAddition[] = recipe.hops.map((h) => ({
    alphaFraction: h.alphaFraction,
    amountG: h.amountG,
    timeMin: h.timeMin,
    use: h.use,
    ...(h.form ? { form: h.form } : {}),
  }));

  return {
    engine: "BEER",
    fermentables,
    hops,
    efficiencyPct: recipe.efficiencyPct,
    batchVolumeL: recipe.batchVolumeL,
    boilVolumeL: recipe.boilVolumeL,
    yeastAttenuationPct: recipe.yeasts[0]?.attenuationPct ?? DEFAULT_ATTENUATION_PCT,
    ...(recipe.style ? { style: recipe.style } : {}),
  };
}
