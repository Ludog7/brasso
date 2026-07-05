/**
 * Moteur ALT_FERMENTED (ginger beer, hydromel, kombucha…).
 *
 * ABV + atténuation (M1-05/M1-11). **IBU/EBC non calculés** (grist malté non
 * pertinent). pH imposé, stabilisation **obligatoire pour publier** (ADR-06),
 * estimation du risque de carbonatation résiduelle (M1-10). Pur (ADR-03).
 *
 * ADR-11 : pH et risque = indicateurs d'aide à la décision, jamais « conforme ».
 */

import { calcAbv } from "../formulas/abv.js";
import { residualCo2 } from "../formulas/carbonation.js";
import { realAttenuation } from "../formulas/postmortem.js";
import type { AltRecipe } from "../schemas/recipe.js";
import {
  FOOD_SAFETY_DISCLAIMER,
  type PhIndicator,
  phIndicator,
  type PublicationCheck,
} from "./common.js";

/** Indicateur de risque de carbonatation résiduelle / surpression (ADR-11). */
export interface CarbonationRiskIndicator {
  readonly kind: "indicator";
  /** CO₂ résiduel estimé (volumes) si `maxTempC` fourni, sinon `null`. */
  readonly residualCo2: number | null;
  /** Sucre résiduel + non stabilisé + stockage ambiant → risque de surpression. */
  readonly atRisk: boolean;
  readonly disclaimer: string;
}

/** Indicateurs calculés d'une recette ALT_FERMENTED (pas d'IBU/EBC). */
export interface AltResult {
  readonly engine: "ALT_FERMENTED";
  readonly abv: number;
  readonly attenuation: number;
  readonly ph: PhIndicator | null;
  readonly carbonationRisk: CarbonationRiskIndicator;
  readonly publication: PublicationCheck;
}

/**
 * Calcule les indicateurs d'une recette ALT_FERMENTED.
 *
 * Publication (règles `core`) : pH obligatoire **et** méthode de stabilisation
 * obligatoire (ADR-06).
 */
export function computeAltFermented(recipe: AltRecipe): AltResult {
  const abv = calcAbv(recipe.og, recipe.fg);
  const attenuation = realAttenuation(recipe.og, recipe.fg);
  const ph = recipe.ph === undefined ? null : phIndicator(recipe.ph);

  const stabilized = recipe.stabilizationMethod != null;
  const ambient = recipe.storageMode === "ambient";
  const carbonationRisk: CarbonationRiskIndicator = {
    kind: "indicator",
    residualCo2: recipe.maxTempC === undefined ? null : residualCo2(recipe.maxTempC),
    atRisk: recipe.residualSugarRisk === true && !stabilized && ambient,
    disclaimer: FOOD_SAFETY_DISCLAIMER,
  };

  const errors: string[] = [];
  if (recipe.ph === undefined) {
    errors.push("pH obligatoire pour publier une recette ALT (indicateur sécurité).");
  }
  if (!stabilized) {
    errors.push("Stabilisation obligatoire pour publier une recette ALT (ADR-06).");
  }

  return {
    engine: "ALT_FERMENTED",
    abv,
    attenuation,
    ph,
    carbonationRisk,
    publication: { publishable: errors.length === 0, errors },
  };
}
