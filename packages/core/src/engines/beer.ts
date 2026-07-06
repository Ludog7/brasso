/**
 * Moteur BEER — assemble les formules brassicoles (M1-04→07) : OG, FG, ABV, IBU,
 * EBC + jauges BJCP. Import/export BeerXML hors périmètre (M2). Pur (ADR-03).
 */

import { calcAbv } from "../formulas/abv.js";
import { calcColorEbc, ebcToHex } from "../formulas/color.js";
import { boilGravity, calcFg, calcOg } from "../formulas/gravity.js";
import { calcIbu } from "../formulas/ibu.js";
import type { BeerRecipe } from "../schemas/recipe.js";
import { points } from "../units.js";
import { type GaugeStatus, gaugeStatus, type PublicationCheck } from "./common.js";
import { recipePublicationCheck } from "./publication.js";

/** Jauges d'alignement aux plages BJCP (§ spec). */
export interface BeerGauges {
  readonly og: GaugeStatus;
  readonly fg: GaugeStatus;
  readonly ibu: GaugeStatus;
  readonly ebc: GaugeStatus;
}

/** Indicateurs calculés d'une recette BEER. */
export interface BeerResult {
  readonly engine: "BEER";
  readonly og: number;
  readonly fg: number;
  readonly abv: number;
  readonly ibu: number;
  readonly ebc: number;
  readonly colorHex: string;
  readonly bjcp: BeerGauges;
  readonly publication: PublicationCheck;
}

/**
 * Calcule les indicateurs d'une recette BEER.
 *
 * OG (M1-04) → FG (atténuation levure) → ABV (M1-05) ; IBU via la boil gravity
 * (M1-06) ; EBC + pastille couleur (M1-07). Les jauges comparent chaque valeur à
 * la plage BJCP du style (si fournie).
 */
export function computeBeer(recipe: BeerRecipe): BeerResult {
  const og = calcOg(recipe.fermentables, recipe.efficiencyPct, recipe.batchVolumeL);
  const ogPoints = points(og);
  const fg = calcFg(ogPoints, recipe.yeastAttenuationPct);
  const abv = calcAbv(og, fg);
  const bg = boilGravity(ogPoints, recipe.batchVolumeL, recipe.boilVolumeL);
  const ibu = calcIbu(recipe.hops, bg, recipe.batchVolumeL);
  const ebc = calcColorEbc(recipe.fermentables, recipe.batchVolumeL);

  const style = recipe.style ?? {};

  return {
    engine: "BEER",
    og,
    fg,
    abv,
    ibu,
    ebc,
    colorHex: ebcToHex(ebc),
    bjcp: {
      og: gaugeStatus(og, style.ogMin, style.ogMax),
      fg: gaugeStatus(fg, style.fgMin, style.fgMax),
      ibu: gaugeStatus(ibu, style.ibuMin, style.ibuMax),
      ebc: gaugeStatus(ebc, style.ebcMin, style.ebcMax),
    },
    // Le moteur BEER n'impose pas de règle de publication `core`.
    publication: recipePublicationCheck({ engine: "BEER" }),
  };
}
