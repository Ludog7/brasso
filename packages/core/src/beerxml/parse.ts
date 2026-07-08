/**
 * Import BeerXML 1.0 → {@link BeerXmlRecipe} (moteur BEER). Toute conversion d'unité
 * passe par `units.ts` (kg→g, SRM→EBC, %→fraction). Les champs inconnus sont
 * ignorés sans erreur ; les champs obligatoires manquants lèvent
 * {@link BeerXmlValidationError} en listant leurs chemins.
 */

import { XMLParser } from "fast-xml-parser";

import { kgToG, pctToFraction, srmToEbc, yieldToPotentialSg } from "../units.js";
import { fermentableType, hopFormFromXml, hopUseFromXml } from "./mapping.js";
import {
  type BeerXmlFermentable,
  type BeerXmlHop,
  type BeerXmlMisc,
  type BeerXmlRecipe,
  type BeerXmlRecipeType,
  type BeerXmlStyleRange,
  BeerXmlValidationError,
  type BeerXmlYeast,
} from "./types.js";

// ── Accès tolérant à la casse / à l'absence ──────────────────────────────────

/** Normalise récursivement les clés en MAJUSCULES (BeerXML est nominalement en majuscules). */
function normalizeKeys(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeKeys);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k.toUpperCase()] = normalizeKeys(v);
    return out;
  }
  return node;
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Valeur scalaire d'un champ (chaîne non vide) ou `undefined` (absent / nœud imbriqué). */
function text(node: unknown, key: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const v = (node as Record<string, unknown>)[key];
  if (v == null || typeof v === "object") return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function reqStr(node: unknown, key: string, path: string, missing: string[]): string {
  const s = text(node, key);
  if (s === undefined) {
    missing.push(path);
    return "";
  }
  return s;
}

function reqNum(node: unknown, key: string, path: string, missing: string[]): number {
  const s = text(node, key);
  const n = s === undefined ? NaN : Number(s);
  if (!Number.isFinite(n)) {
    missing.push(path);
    return 0;
  }
  return n;
}

function optNum(node: unknown, key: string): number | undefined {
  const s = text(node, key);
  const n = s === undefined ? NaN : Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Enfant d'un conteneur (`<HOPS><HOP>…`) → `container[item]`, sinon `undefined`. */
function child(node: unknown, container: string, item: string): unknown {
  if (!node || typeof node !== "object") return undefined;
  const c = (node as Record<string, unknown>)[container];
  if (c && typeof c === "object") return (c as Record<string, unknown>)[item];
  return undefined;
}

// ── Localisation de la recette ───────────────────────────────────────────────

function findRecipe(root: Record<string, unknown>): unknown {
  const recipes = root["RECIPES"];
  if (recipes && typeof recipes === "object") {
    const first = asArray((recipes as Record<string, unknown>)["RECIPE"])[0];
    if (first) return first;
  }
  const direct = asArray(root["RECIPE"])[0];
  return direct ?? undefined;
}

function recipeType(raw: string | undefined): BeerXmlRecipeType {
  switch (raw?.trim().toLowerCase()) {
    case "extract":
      return "Extract";
    case "partial mash":
      return "Partial Mash";
    default:
      return "All Grain";
  }
}

// ── Sous-collections ─────────────────────────────────────────────────────────

function parseFermentables(recipe: unknown, missing: string[]): BeerXmlFermentable[] {
  return asArray(child(recipe, "FERMENTABLES", "FERMENTABLE")).map((f, i) => {
    const base = `RECIPE/FERMENTABLES/FERMENTABLE[${i}]`;
    const name = reqStr(f, "NAME", `${base}/NAME`, missing);
    const amountKg = reqNum(f, "AMOUNT", `${base}/AMOUNT`, missing);
    const yieldPct = reqNum(f, "YIELD", `${base}/YIELD`, missing);
    const colorSrm = reqNum(f, "COLOR", `${base}/COLOR`, missing);
    return {
      name,
      type: fermentableType(text(f, "TYPE") ?? ""),
      amountG: kgToG(amountKg),
      potentialSg: yieldToPotentialSg(yieldPct),
      colorEbc: srmToEbc(colorSrm),
    };
  });
}

function parseHops(recipe: unknown, missing: string[]): BeerXmlHop[] {
  return asArray(child(recipe, "HOPS", "HOP")).map((h, i) => {
    const base = `RECIPE/HOPS/HOP[${i}]`;
    const name = reqStr(h, "NAME", `${base}/NAME`, missing);
    const amountKg = reqNum(h, "AMOUNT", `${base}/AMOUNT`, missing);
    const alphaPct = reqNum(h, "ALPHA", `${base}/ALPHA`, missing);
    const use = reqStr(h, "USE", `${base}/USE`, missing);
    const timeMin = reqNum(h, "TIME", `${base}/TIME`, missing);
    const form = hopFormFromXml(text(h, "FORM"));
    return {
      name,
      amountG: kgToG(amountKg),
      alphaFraction: pctToFraction(alphaPct),
      timeMin,
      use: hopUseFromXml(use),
      ...(form ? { form } : {}),
    };
  });
}

function parseYeasts(recipe: unknown, missing: string[]): BeerXmlYeast[] {
  return asArray(child(recipe, "YEASTS", "YEAST")).map((y, i) => {
    const base = `RECIPE/YEASTS/YEAST[${i}]`;
    return {
      name: reqStr(y, "NAME", `${base}/NAME`, missing),
      attenuationPct: reqNum(y, "ATTENUATION", `${base}/ATTENUATION`, missing),
    };
  });
}

function parseMiscs(recipe: unknown, missing: string[]): BeerXmlMisc[] {
  return asArray(child(recipe, "MISCS", "MISC")).map((m, i) => {
    const base = `RECIPE/MISCS/MISC[${i}]`;
    const name = reqStr(m, "NAME", `${base}/NAME`, missing);
    const type = reqStr(m, "TYPE", `${base}/TYPE`, missing);
    const use = text(m, "USE");
    const amountIsWeight = (text(m, "AMOUNT_IS_WEIGHT") ?? "").toLowerCase() === "true";
    const amount = optNum(m, "AMOUNT");
    return {
      name,
      type,
      ...(use ? { use } : {}),
      amountIsWeight,
      ...(amount !== undefined
        ? amountIsWeight
          ? { amountG: kgToG(amount) }
          : { amountL: amount }
        : {}),
    };
  });
}

function parseStyle(recipe: unknown): BeerXmlStyleRange | undefined {
  if (!recipe || typeof recipe !== "object") return undefined;
  const s = (recipe as Record<string, unknown>)["STYLE"];
  if (!s || typeof s !== "object") return undefined;

  const name = text(s, "NAME");
  const category = text(s, "CATEGORY");
  const ogMin = optNum(s, "OG_MIN");
  const ogMax = optNum(s, "OG_MAX");
  const fgMin = optNum(s, "FG_MIN");
  const fgMax = optNum(s, "FG_MAX");
  const ibuMin = optNum(s, "IBU_MIN");
  const ibuMax = optNum(s, "IBU_MAX");
  const colorMin = optNum(s, "COLOR_MIN");
  const colorMax = optNum(s, "COLOR_MAX");

  return {
    ...(name ? { name } : {}),
    ...(category ? { category } : {}),
    ...(ogMin !== undefined ? { ogMin } : {}),
    ...(ogMax !== undefined ? { ogMax } : {}),
    ...(fgMin !== undefined ? { fgMin } : {}),
    ...(fgMax !== undefined ? { fgMax } : {}),
    ...(ibuMin !== undefined ? { ibuMin } : {}),
    ...(ibuMax !== undefined ? { ibuMax } : {}),
    ...(colorMin !== undefined ? { ebcMin: srmToEbc(colorMin) } : {}),
    ...(colorMax !== undefined ? { ebcMax: srmToEbc(colorMax) } : {}),
  };
}

// ── Point d'entrée ───────────────────────────────────────────────────────────

const PARSER = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

/**
 * Parse un document BeerXML 1.0 et renvoie la **première** recette (`<RECIPE>`),
 * en unités internes. Lève {@link BeerXmlValidationError} si aucune recette n'est
 * trouvée ou si des champs obligatoires manquent.
 */
export function parseBeerXml(xml: string): BeerXmlRecipe {
  const root = normalizeKeys(PARSER.parse(xml)) as Record<string, unknown>;
  const recipe = findRecipe(root);
  if (!recipe) {
    throw new BeerXmlValidationError(["RECIPES/RECIPE"]);
  }

  const missing: string[] = [];
  const name = reqStr(recipe, "NAME", "RECIPE/NAME", missing);
  const batchVolumeL = reqNum(recipe, "BATCH_SIZE", "RECIPE/BATCH_SIZE", missing);
  const boilVolumeL = reqNum(recipe, "BOIL_SIZE", "RECIPE/BOIL_SIZE", missing);
  const boilTimeMin = reqNum(recipe, "BOIL_TIME", "RECIPE/BOIL_TIME", missing);
  const efficiencyPct = reqNum(recipe, "EFFICIENCY", "RECIPE/EFFICIENCY", missing);
  const fermentables = parseFermentables(recipe, missing);
  const hops = parseHops(recipe, missing);
  const yeasts = parseYeasts(recipe, missing);
  const miscs = parseMiscs(recipe, missing);
  const style = parseStyle(recipe);

  if (missing.length > 0) {
    throw new BeerXmlValidationError(missing);
  }

  return {
    engine: "BEER",
    name,
    type: recipeType(text(recipe, "TYPE")),
    batchVolumeL,
    boilVolumeL,
    boilTimeMin,
    efficiencyPct,
    fermentables,
    hops,
    yeasts,
    miscs,
    ...(style ? { style } : {}),
  };
}
