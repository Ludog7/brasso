/**
 * Export {@link BeerXmlRecipe} → BeerXML 1.0. Conversions inverses via `units.ts`
 * (g→kg, EBC→SRM, fraction→%). Le document produit est réimportable à l'identique
 * par {@link parseBeerXml} (round-trip). Une recette non-BEER lève
 * {@link BeerXmlEngineError}.
 */

import { XMLBuilder } from "fast-xml-parser";

import { ebcToSrm, fractionToPct, gToKg, potentialSgToYield } from "../units.js";
import { hopFormToXml, hopUseToXml } from "./mapping.js";
import {
  BeerXmlEngineError,
  type BeerXmlFermentable,
  type BeerXmlHop,
  type BeerXmlMisc,
  type BeerXmlRecipe,
  type BeerXmlStyleRange,
  type BeerXmlYeast,
} from "./types.js";

/** Arrondi stable (6 décimales, zéros superflus retirés) pour un XML lisible et idempotent. */
function round(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

function fermentableNode(f: BeerXmlFermentable): Record<string, unknown> {
  return {
    NAME: f.name,
    VERSION: 1,
    TYPE: f.type,
    AMOUNT: round(gToKg(f.amountG)),
    YIELD: round(potentialSgToYield(f.potentialSg)),
    COLOR: round(ebcToSrm(f.colorEbc)),
  };
}

function hopNode(h: BeerXmlHop): Record<string, unknown> {
  return {
    NAME: h.name,
    VERSION: 1,
    ALPHA: round(fractionToPct(h.alphaFraction)),
    AMOUNT: round(gToKg(h.amountG)),
    USE: hopUseToXml(h.use),
    TIME: round(h.timeMin),
    ...(h.form ? { FORM: hopFormToXml(h.form) } : {}),
  };
}

function yeastNode(y: BeerXmlYeast): Record<string, unknown> {
  return { NAME: y.name, VERSION: 1, ATTENUATION: round(y.attenuationPct) };
}

function miscNode(m: BeerXmlMisc): Record<string, unknown> {
  const amount = m.amountIsWeight ? gToKg(m.amountG ?? 0) : (m.amountL ?? 0);
  return {
    NAME: m.name,
    VERSION: 1,
    TYPE: m.type,
    ...(m.use ? { USE: m.use } : {}),
    AMOUNT_IS_WEIGHT: m.amountIsWeight ? "TRUE" : "FALSE",
    AMOUNT: round(amount),
  };
}

function styleNode(style: BeerXmlStyleRange): Record<string, unknown> {
  return {
    ...(style.name ? { NAME: style.name } : {}),
    VERSION: 1,
    ...(style.category ? { CATEGORY: style.category } : {}),
    ...(style.ogMin !== undefined ? { OG_MIN: round(style.ogMin) } : {}),
    ...(style.ogMax !== undefined ? { OG_MAX: round(style.ogMax) } : {}),
    ...(style.fgMin !== undefined ? { FG_MIN: round(style.fgMin) } : {}),
    ...(style.fgMax !== undefined ? { FG_MAX: round(style.fgMax) } : {}),
    ...(style.ibuMin !== undefined ? { IBU_MIN: round(style.ibuMin) } : {}),
    ...(style.ibuMax !== undefined ? { IBU_MAX: round(style.ibuMax) } : {}),
    ...(style.ebcMin !== undefined ? { COLOR_MIN: round(ebcToSrm(style.ebcMin)) } : {}),
    ...(style.ebcMax !== undefined ? { COLOR_MAX: round(ebcToSrm(style.ebcMax)) } : {}),
  };
}

const BUILDER = new XMLBuilder({ format: true, indentBy: "  ", suppressEmptyNode: false });

/**
 * Sérialise une recette BEER en BeerXML 1.0 (`<RECIPES><RECIPE>…`). Lève
 * {@link BeerXmlEngineError} si `recipe.engine` n'est pas `"BEER"`.
 */
export function serializeBeerXml(recipe: BeerXmlRecipe): string {
  if (recipe.engine !== "BEER") {
    throw new BeerXmlEngineError((recipe as { engine: string }).engine);
  }

  const recipeNode = {
    NAME: recipe.name,
    VERSION: 1,
    TYPE: recipe.type,
    BREWER: "",
    BATCH_SIZE: round(recipe.batchVolumeL),
    BOIL_SIZE: round(recipe.boilVolumeL),
    BOIL_TIME: round(recipe.boilTimeMin),
    EFFICIENCY: round(recipe.efficiencyPct),
    ...(recipe.style ? { STYLE: styleNode(recipe.style) } : {}),
    FERMENTABLES: { FERMENTABLE: recipe.fermentables.map(fermentableNode) },
    HOPS: { HOP: recipe.hops.map(hopNode) },
    YEASTS: { YEAST: recipe.yeasts.map(yeastNode) },
    MISCS: { MISC: recipe.miscs.map(miscNode) },
  };

  const body: string = BUILDER.build({ RECIPES: { RECIPE: recipeNode } });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}
