/**
 * Portabilité des recettes (M2-12) — pont entre la **recette persistée**
 * (`RecipeWithDetails`) et les **formats d'échange `core`** :
 * - moteur BEER ↔ BeerXML 1.0 (M2-10) ;
 * - moteurs ALT_FERMENTED / SOFT_DRINK ↔ JSON propriétaire `brasso-recipe` v1 (M2-11).
 *
 * Aucune formule ni conversion d'unité maison ici : les conversions vivent dans
 * `@brasso/core` (`units.ts`, sérialiseurs). Ce module ne fait que transporter les
 * champs entre la forme de persistance API et les DTO/schémas du core.
 */

import type {
  BeerXmlFermentable,
  BeerXmlHop,
  BeerXmlMisc,
  BeerXmlRecipe,
  BeerXmlYeast,
  BrassoRecipeContent,
  BrassoRecipeEnvelope,
  HopUse,
  IngredientUse,
  RecipeIngredientInput,
  RecipeStepInput,
} from "@brasso/core";
import {
  altDetailsSchema,
  BeerXmlEngineError,
  BeerXmlValidationError,
  BrassoRecipeEngineError,
  BrassoRecipeValidationError,
  BrassoRecipeVersionError,
  exportRecipeJson,
  fractionToPct,
  importRecipeJson,
  parseBeerXml,
  pctToFraction,
  recipeIngredientSchema,
  recipeStepInputSchema,
  serializeBeerXml,
  softDetailsSchema,
} from "@brasso/core";
import type { z } from "zod";

import type { RecipeIngredientView, RecipeStepView, RecipeWithDetails } from "./repository.js";
import type { RecipeCreateBody } from "./schema.js";

/** Rendement de brassage par défaut (%) si la recette n'en déclare pas (aligné éditeur). */
const DEFAULT_EFFICIENCY_PCT = 72;
/** Atténuation apparente par défaut (%) pour une levure sans donnée. */
const DEFAULT_ATTENUATION_PCT = 75;
/** Durée d'ébullition par défaut (min) pour une recette BEER sans donnée. */
const DEFAULT_BOIL_TIME_MIN = 60;

// Types d'entrée `core` (avant application des défauts Zod) — évitent tout cast.
type InterchangeIngredient = z.input<typeof recipeIngredientSchema>;
type InterchangeStep = z.input<typeof recipeStepInputSchema>;
type InterchangeAltDetails = z.input<typeof altDetailsSchema>;
type InterchangeSoftDetails = z.input<typeof softDetailsSchema>;

/**
 * Import invalide (parse/validation) → 422. `details.messages` porte des libellés
 * lisibles ; `details.paths` les chemins des champs fautifs (repris par l'UI).
 */
export class RecipeImportError extends Error {
  readonly statusCode = 422;
  readonly code = "IMPORT_INVALID";
  readonly details: { messages: string[]; paths?: string[] };
  constructor(message: string, messages: string[], paths?: string[]) {
    super(message);
    this.name = "RecipeImportError";
    this.details = paths && paths.length > 0 ? { messages, paths } : { messages };
  }
}

/** Document d'export prêt à émettre (corps + en-têtes HTTP). */
export interface RecipeExport {
  readonly body: string;
  readonly contentType: string;
  readonly filename: string;
}

/** Recette parsée depuis un fichier importé, prête pour le service (M2-01/M2-02). */
export interface ParsedImport {
  readonly createBody: RecipeCreateBody;
  readonly ingredients: RecipeIngredientInput[];
  readonly steps: RecipeStepInput[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Export : recette persistée → fichier
// ─────────────────────────────────────────────────────────────────────────────

/** Sérialise une recette selon son moteur (BEER → BeerXML, ALT/SOFT → JSON propriétaire). */
export function exportRecipe(recipe: RecipeWithDetails): RecipeExport {
  const slug = slugify(recipe.name);
  if (recipe.engine === "BEER") {
    return {
      body: serializeBeerXml(recipeToBeerXml(recipe)),
      contentType: "application/xml; charset=utf-8",
      filename: `${slug}.xml`,
    };
  }
  return {
    body: JSON.stringify(recipeToEnvelope(recipe), null, 2),
    contentType: "application/json; charset=utf-8",
    filename: `${slug}.json`,
  };
}

/** Projette une recette BEER persistée vers le DTO BeerXML (unités internes conservées). */
function recipeToBeerXml(recipe: RecipeWithDetails): BeerXmlRecipe {
  const details = recipe.beerDetails;
  const batchVolumeL = details?.batchVolumeL ?? 0;

  const fermentables: BeerXmlFermentable[] = [];
  const hops: BeerXmlHop[] = [];
  const yeasts: BeerXmlYeast[] = [];
  const miscs: BeerXmlMisc[] = [];

  for (const ing of recipe.ingredients) {
    switch (ing.category) {
      case "MALT":
      case "SUGAR":
        fermentables.push({
          name: ing.name,
          type: ing.category === "MALT" ? "Grain" : "Sugar",
          amountG: ing.amount,
          potentialSg: readNum(ing.params, "potentialSg") ?? 1,
          colorEbc: readNum(ing.params, "colorEbc") ?? 0,
        });
        break;
      case "HOP": {
        const form = readForm(ing.params);
        hops.push({
          name: ing.name,
          amountG: ing.amount,
          alphaFraction: readNum(ing.params, "alphaFraction") ?? 0,
          timeMin: ing.timeMinutes ?? 0,
          use: ingredientUseToHop(ing.use),
          ...(form ? { form } : {}),
        });
        break;
      }
      case "YEAST":
        yeasts.push({
          name: ing.name,
          attenuationPct: readNum(ing.params, "attenuationPct") ?? DEFAULT_ATTENUATION_PCT,
        });
        break;
      case "ADJUNCT":
        miscs.push({
          name: ing.name,
          type: "Other",
          amountIsWeight: ing.unit !== "LITER",
          ...(ing.unit === "LITER" ? { amountL: ing.amount } : { amountG: ing.amount }),
        });
        break;
    }
  }

  return {
    engine: "BEER",
    name: recipe.name,
    type: "All Grain",
    batchVolumeL,
    // Le volume d'ébullition n'est pas persisté → approximé au volume final (aligné éditeur).
    boilVolumeL: batchVolumeL,
    boilTimeMin: details?.boilTimeMin ?? DEFAULT_BOIL_TIME_MIN,
    efficiencyPct:
      details?.efficiency != null ? fractionToPct(details.efficiency) : DEFAULT_EFFICIENCY_PCT,
    fermentables,
    hops,
    yeasts,
    miscs,
  };
}

/** Projette une recette ALT/SOFT persistée vers l'enveloppe `brasso-recipe` v1. */
function recipeToEnvelope(recipe: RecipeWithDetails): BrassoRecipeEnvelope {
  const common = {
    name: recipe.name,
    status: recipe.status,
    notes: recipe.notes ?? undefined,
    ingredients: recipe.ingredients.map(ingredientToInterchange),
    steps: recipe.steps.map(stepToInterchange),
  };

  const content: BrassoRecipeContent =
    recipe.engine === "ALT_FERMENTED"
      ? {
          engine: "ALT_FERMENTED",
          recipe: { ...common, altDetails: altDetailsToInterchange(recipe.altDetails) },
        }
      : {
          engine: "SOFT_DRINK",
          recipe: { ...common, softDetails: softDetailsToInterchange(recipe.softDetails) },
        };
  return exportRecipeJson(content);
}

function altDetailsToInterchange(alt: RecipeWithDetails["altDetails"]): InterchangeAltDetails {
  return {
    baseType: alt?.baseType ?? "",
    targetPh: alt?.targetPh ?? undefined,
    stabilizationMethod: alt?.stabilizationMethod ?? undefined,
    residualSugarRisk: alt?.residualSugarRisk ?? false,
    batchVolumeL: alt?.batchVolumeL ?? undefined,
  };
}

function softDetailsToInterchange(soft: RecipeWithDetails["softDetails"]): InterchangeSoftDetails {
  return {
    sugarConcentration: soft?.sugarConcentration ?? undefined,
    targetPh: soft?.targetPh ?? undefined,
    storageMode: (soft?.storageMode as "cold" | "ambient" | null) ?? undefined,
    stabilizationMethod: soft?.stabilizationMethod ?? undefined,
    batchVolumeL: soft?.batchVolumeL ?? undefined,
  };
}

/** Vue ingrédient persistée → forme d'échange `brasso-recipe` (unités internes). */
function ingredientToInterchange(ing: RecipeIngredientView): InterchangeIngredient {
  return {
    name: ing.name,
    category: ing.category,
    use: ing.use ?? undefined,
    amount: ing.amount,
    unit: ing.unit,
    timeMinutes: ing.timeMinutes ?? undefined,
    catalogItemId: ing.catalogItemId ?? undefined,
    sortOrder: ing.sortOrder,
    params: isRecord(ing.params) ? ing.params : undefined,
  };
}

/** Vue étape persistée → forme d'échange `brasso-recipe`. */
function stepToInterchange(step: RecipeStepView): InterchangeStep {
  return {
    type: step.type,
    name: step.name ?? undefined,
    params: isRecord(step.params) ? step.params : {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Import : fichier → recette à créer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Détecte le format d'un corps importé (XML BeerXML ou JSON `brasso-recipe`) et
 * en dérive une recette prête à créer. Traduit toute erreur `core` en
 * {@link RecipeImportError} (422).
 */
export function parseImport(payload: unknown): ParsedImport {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.startsWith("<")) {
      return fromBeerXml(payload);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new RecipeImportError("Fichier importé illisible (ni XML ni JSON valide).", [
        "Le contenu n'est ni du BeerXML ni du JSON valide.",
      ]);
    }
    return fromInterchange(parsed);
  }
  if (payload !== null && typeof payload === "object") {
    return fromInterchange(payload);
  }
  throw new RecipeImportError("Format de fichier non reconnu.", [
    "Format non reconnu : fournir un fichier BeerXML (.xml) ou brasso-recipe (.json).",
  ]);
}

/** BeerXML → recette BEER à créer (ingrédients typés par catégorie). */
function fromBeerXml(xml: string): ParsedImport {
  let dto: BeerXmlRecipe;
  try {
    dto = parseBeerXml(xml);
  } catch (error) {
    if (error instanceof BeerXmlValidationError) {
      throw new RecipeImportError(error.message, [error.message], [...error.paths]);
    }
    if (error instanceof BeerXmlEngineError) {
      throw new RecipeImportError(error.message, [error.message]);
    }
    throw error;
  }

  const ingredients: RecipeIngredientInput[] = [
    ...dto.fermentables.map(fermentableToIngredient),
    ...dto.hops.map(hopToIngredient),
    ...dto.yeasts.map(yeastToIngredient),
    ...dto.miscs.map(miscToIngredient),
  ];

  return {
    createBody: {
      engine: "BEER",
      name: dto.name,
      beerDetails: {
        batchVolumeL: dto.batchVolumeL,
        boilTimeMin: dto.boilTimeMin,
        efficiency: pctToFraction(dto.efficiencyPct),
      },
    },
    ingredients,
    steps: [],
  };
}

/** JSON `brasso-recipe` → recette ALT/SOFT à créer. */
function fromInterchange(data: unknown): ParsedImport {
  let envelope: BrassoRecipeEnvelope;
  try {
    envelope = importRecipeJson(data);
  } catch (error) {
    if (error instanceof BrassoRecipeValidationError) {
      throw new RecipeImportError(error.message, [error.message], [...error.paths]);
    }
    if (error instanceof BrassoRecipeVersionError || error instanceof BrassoRecipeEngineError) {
      throw new RecipeImportError(error.message, [error.message]);
    }
    throw error;
  }

  const ingredients = envelope.recipe.ingredients.map(
    (ing): RecipeIngredientInput =>
      ({
        category: ing.category,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        ...(ing.use != null ? { use: ing.use } : {}),
        ...(ing.timeMinutes != null ? { timeMinutes: ing.timeMinutes } : {}),
        ...(ing.catalogItemId != null ? { catalogItemId: ing.catalogItemId } : {}),
        ...(ing.params != null ? { params: ing.params } : {}),
      }) as RecipeIngredientInput,
  );
  const steps = envelope.recipe.steps.map((step): RecipeStepInput => ({
    type: step.type,
    ...(step.name != null ? { name: step.name } : {}),
    params: step.params,
  }));

  const createBody: RecipeCreateBody =
    envelope.engine === "ALT_FERMENTED"
      ? {
          engine: "ALT_FERMENTED",
          name: envelope.recipe.name,
          ...(envelope.recipe.notes != null ? { notes: envelope.recipe.notes } : {}),
          altDetails: envelope.recipe.altDetails,
        }
      : {
          engine: "SOFT_DRINK",
          name: envelope.recipe.name,
          ...(envelope.recipe.notes != null ? { notes: envelope.recipe.notes } : {}),
          softDetails: envelope.recipe.softDetails,
        };

  return { createBody, ingredients, steps };
}

// ── Mappings BeerXML DTO → ingrédients persistés ─────────────────────────────

/** Fermentescible BeerXML → MALT (empâté) ou SUGAR (sucre/extrait). */
function fermentableToIngredient(f: BeerXmlFermentable): RecipeIngredientInput {
  const mashable = f.type === "Grain" || f.type === "Adjunct";
  if (mashable) {
    return {
      category: "MALT",
      name: f.name,
      amount: f.amountG,
      unit: "GRAM",
      params: { isMashable: true, potentialSg: f.potentialSg, colorEbc: f.colorEbc },
    };
  }
  return {
    category: "SUGAR",
    name: f.name,
    amount: f.amountG,
    unit: "GRAM",
    params: { potentialSg: f.potentialSg, colorEbc: f.colorEbc },
  };
}

function hopToIngredient(h: BeerXmlHop): RecipeIngredientInput {
  return {
    category: "HOP",
    name: h.name,
    amount: h.amountG,
    unit: "GRAM",
    use: hopUseToIngredient(h.use),
    timeMinutes: Math.round(h.timeMin),
    params: { alphaFraction: h.alphaFraction, ...(h.form ? { form: h.form } : {}) },
  };
}

function yeastToIngredient(y: BeerXmlYeast): RecipeIngredientInput {
  return {
    category: "YEAST",
    name: y.name,
    amount: 0,
    unit: "GRAM",
    params: { attenuationPct: y.attenuationPct },
  };
}

function miscToIngredient(m: BeerXmlMisc): RecipeIngredientInput {
  const liter = !m.amountIsWeight;
  return {
    category: "ADJUNCT",
    name: m.name,
    amount: (liter ? m.amountL : m.amountG) ?? 0,
    unit: liter ? "LITER" : "GRAM",
  };
}

// ── Correspondances d'énumérations (locales : le core n'exporte pas ses tables) ─

/** `HopUse` (BeerXML/calcul) → `IngredientUse` (persistance). */
function hopUseToIngredient(use: HopUse): IngredientUse {
  switch (use) {
    case "first_wort":
      return "FIRST_WORT";
    case "whirlpool":
    case "hop_stand":
      return "WHIRLPOOL";
    case "dry_hop":
      return "DRY_HOP";
    case "boil":
      return "BOIL";
  }
}

/** `IngredientUse` (persistance) → `HopUse` (BeerXML/calcul). Défaut `boil`. */
function ingredientUseToHop(use: IngredientUse | null): HopUse {
  switch (use) {
    case "FIRST_WORT":
      return "first_wort";
    case "WHIRLPOOL":
      return "whirlpool";
    case "DRY_HOP":
      return "dry_hop";
    default:
      return "boil";
  }
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNum(params: unknown, key: string): number | undefined {
  if (isRecord(params) && typeof params[key] === "number") {
    return params[key] as number;
  }
  return undefined;
}

function readForm(params: unknown): "pellet" | "cryo" | "leaf" | "plug" | undefined {
  if (isRecord(params) && typeof params.form === "string") {
    const form = params.form;
    if (form === "pellet" || form === "cryo" || form === "leaf" || form === "plug") {
      return form;
    }
  }
  return undefined;
}

/** Nom de fichier propre à partir du nom de recette (ASCII, tirets). */
function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "recette";
}
