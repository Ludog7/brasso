/**
 * Projection **éditeur ↔ moteur** de l'ALT_FERMENTED_ENGINE (ginger beer, hydromel,
 * kombucha…). L'état d'édition est saisi en chaînes (champs contrôlés) ; ce module
 * le reprojette d'un côté vers l'entrée pure `AltRecipe` de `@brasso/core`
 * (`computeAltFermented`), de l'autre vers les inputs de persistance
 * (`RecipeIngredientInput`/`RecipeStepInput`, M2-02).
 *
 * Aucune formule ici (règle FORMULES-BRASSICOLES.md) : uniquement du transport de
 * données. Deux natures d'état, volontairement séparées :
 *
 * - **`AltFormState`** — champs de recette persistés (PATCH `altDetails` + PUT
 *   ingrédients + PUT étapes). Pilotent le `dirty`/la sauvegarde.
 * - **`AltEstimationInputs`** — hypothèses **d'estimation non persistées** : les
 *   densités OG/FG et les conditions de conservation (`storageMode`, `maxTempC`)
 *   n'existent pas dans `RecipeAltDetails` (schéma M2-01) ; elles alimentent le
 *   panneau d'indicateurs (« ABV **estimé** », « **estimation** du risque ») sans
 *   toucher la persistance — ce qui relèverait d'un ticket API.
 */

import type {
  AltRecipe,
  ProcessStepType,
  RecipeIngredientInput,
  RecipeStepInput,
  StabilizationMethod,
  StorageMode,
} from "@brasso/core";

import type { AltDetails, RecipeDetail } from "@/lib/api";

/**
 * Densités de repli pour `computeAltFermented` : le moteur **exige** og/fg (calcul
 * ABV/atténuation) et `realAttenuation` lève si og ≤ 1.000. Tant que l'utilisateur
 * n'a pas saisi de densités, on passe des valeurs neutres > 1 pour ne pas lever —
 * l'ABV/atténuation ne sont alors **pas affichés** (cf. `readGravities().entered`).
 * pH et risque de carbonatation ne dépendent pas des densités.
 */
const FALLBACK_OG = 1.05;
const FALLBACK_FG = 1.01;

// ── Modèle d'édition (champs en chaînes) ─────────────────────────────────────

export interface SugarRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  amountG: string;
}

export interface YeastRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  attenuationPct: string;
  amountG: string;
}

/** Ingrédient non standard : jus, sirop maison, infusion… (catégorie ADJUNCT). */
export interface AdjunctRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  amountG: string;
}

export interface AltStepRow {
  key: string;
  type: ProcessStepType;
  name: string;
  tempC: string;
  timeMin: string;
  days: string;
}

/** État persisté d'un brouillon ALT_FERMENTED. */
export interface AltFormState {
  name: string;
  description: string;
  baseType: string;
  /** pH visé (imposé pour publier — ADR-06) ; pilote l'indicateur pH. */
  targetPh: string;
  stabilizationMethod: StabilizationMethod | "";
  residualSugarRisk: boolean;
  batchVolumeL: string;
  sugars: SugarRow[];
  yeasts: YeastRow[];
  adjuncts: AdjunctRow[];
  steps: AltStepRow[];
}

/** Hypothèses d'estimation **non persistées** (alimentent le panneau d'indicateurs). */
export interface AltEstimationInputs {
  /** Densité initiale mesurée/visée (SG brute) — ABV/atténuation. */
  og: string;
  /** Densité finale mesurée/visée (SG brute) — ABV/atténuation. */
  fg: string;
  /** Mode de conservation (froid / ambiant) — facteur du risque de carbonatation. */
  storageMode: StorageMode;
  /** Température la plus haute atteinte (°C) — CO₂ résiduel estimé. */
  maxTempC: string;
}

/** Estimation par défaut : « ambiant » (hypothèse conservatrice pour le risque). */
export const emptyEstimation = (): AltEstimationInputs => ({
  og: "",
  fg: "",
  storageMode: "ambient",
  maxTempC: "",
});

// ── Utilitaires de parsing / formatage ───────────────────────────────────────

let keyCounter = 0;
/** Clé stable pour les listes React (indépendante de l'index → réordonnable). */
export function newRowKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

function num(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse public d'un champ numérique (`undefined` si vide/invalide). */
export function parseNumber(value: string): number | undefined {
  return num(value);
}

function numOr(value: string, fallback: number): number {
  return num(value) ?? fallback;
}

function fmt(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function readNum(params: unknown, key: string): number | undefined {
  if (params && typeof params === "object" && key in params) {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
  }
  return undefined;
}

function withNum(key: string, value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}

/** Une ligne « compte » (calcul + persistance) dès qu'elle porte un nom. */
const named = <T extends { name: string }>(row: T): boolean => row.name.trim().length > 0;

// ── Dérivation de l'état d'édition depuis une recette chargée ─────────────────

export function altStateFromRecipe(recipe: RecipeDetail): AltFormState {
  const details = recipe.altDetails;
  const sugars: SugarRow[] = [];
  const yeasts: YeastRow[] = [];
  const adjuncts: AdjunctRow[] = [];

  for (const ing of recipe.ingredients) {
    switch (ing.category) {
      case "SUGAR":
        sugars.push({
          key: newRowKey("sugar"),
          catalogItemId: ing.catalogItemId,
          name: ing.name,
          amountG: fmt(ing.amount),
        });
        break;
      case "YEAST":
        yeasts.push({
          key: newRowKey("yeast"),
          catalogItemId: ing.catalogItemId,
          name: ing.name,
          attenuationPct: fmt(readNum(ing.params, "attenuationPct")),
          amountG: fmt(ing.amount),
        });
        break;
      case "ADJUNCT":
        adjuncts.push({
          key: newRowKey("adjunct"),
          catalogItemId: ing.catalogItemId,
          name: ing.name,
          amountG: fmt(ing.amount),
        });
        break;
      // MALT/HOP non pertinents pour ALT (ingredientCategoriesByEngine) — ignorés.
    }
  }

  const steps: AltStepRow[] = recipe.steps.map((step) => ({
    key: newRowKey("step"),
    type: step.type,
    name: step.name ?? "",
    tempC: fmt(readNum(step.params, "tempC") ?? readNum(step.params, "targetTempC")),
    timeMin: fmt(readNum(step.params, "timeMin")),
    days: fmt(readNum(step.params, "days")),
  }));

  return {
    name: recipe.name,
    description: recipe.notes ?? "",
    baseType: details?.baseType ?? "",
    targetPh: fmt(details?.targetPh),
    stabilizationMethod: (details?.stabilizationMethod ?? "") as StabilizationMethod | "",
    residualSugarRisk: details?.residualSugarRisk ?? false,
    batchVolumeL: fmt(details?.batchVolumeL),
    sugars,
    yeasts,
    adjuncts,
    steps,
  };
}

// ── Projection vers l'entrée moteur `computeAltFermented` ────────────────────

/** Densités exploitables (> 1) ou repli neutre ; `entered` gouverne l'affichage. */
function readGravities(est: AltEstimationInputs): { og: number; fg: number; entered: boolean } {
  const og = num(est.og);
  const fg = num(est.fg);
  if (og !== undefined && fg !== undefined && og > 1 && fg >= 1 && fg <= og) {
    return { og, fg, entered: true };
  }
  return { og: FALLBACK_OG, fg: FALLBACK_FG, entered: false };
}

/** L'utilisateur a-t-il saisi des densités cohérentes (ABV/atténuation affichables) ? */
export function gravitiesEntered(est: AltEstimationInputs): boolean {
  return readGravities(est).entered;
}

/**
 * Recette moteur pour `computeAltFermented`. Combine les champs persistés (pH,
 * stabilisation, risque sucre, volume) et les hypothèses d'estimation (densités,
 * conservation). Les densités absentes sont remplacées par un repli neutre — cf.
 * `FALLBACK_OG`/`FALLBACK_FG`.
 */
export function toAltRecipe(form: AltFormState, est: AltEstimationInputs): AltRecipe {
  const { og, fg } = readGravities(est);
  const targetPh = num(form.targetPh);
  const maxTempC = num(est.maxTempC);
  const batchVolumeL = num(form.batchVolumeL);

  return {
    engine: "ALT_FERMENTED",
    og,
    fg,
    ...(targetPh !== undefined ? { ph: targetPh } : {}),
    stabilizationMethod: form.stabilizationMethod === "" ? null : form.stabilizationMethod,
    storageMode: est.storageMode,
    ...(maxTempC !== undefined ? { maxTempC } : {}),
    residualSugarRisk: form.residualSugarRisk,
    ...(batchVolumeL !== undefined && batchVolumeL > 0 ? { batchVolumeL } : {}),
  };
}

// ── Projection vers les inputs de persistance (M2-02) ────────────────────────

export function toIngredientInputs(state: AltFormState): RecipeIngredientInput[] {
  const out: RecipeIngredientInput[] = [];

  for (const s of state.sugars.filter(named)) {
    out.push({
      category: "SUGAR",
      name: s.name.trim(),
      amount: numOr(s.amountG, 0),
      unit: "GRAM",
      ...(s.catalogItemId ? { catalogItemId: s.catalogItemId } : {}),
    });
  }

  for (const y of state.yeasts.filter(named)) {
    out.push({
      category: "YEAST",
      name: y.name.trim(),
      amount: numOr(y.amountG, 0),
      unit: "GRAM",
      ...(y.catalogItemId ? { catalogItemId: y.catalogItemId } : {}),
      params: { ...withNum("attenuationPct", num(y.attenuationPct)) },
    });
  }

  for (const a of state.adjuncts.filter(named)) {
    out.push({
      category: "ADJUNCT",
      name: a.name.trim(),
      amount: numOr(a.amountG, 0),
      unit: "GRAM",
      ...(a.catalogItemId ? { catalogItemId: a.catalogItemId } : {}),
    });
  }

  return out;
}

/** Construit les `params` d'une étape ALT selon son type (schémas M2-02). */
function stepParams(row: AltStepRow): Record<string, unknown> {
  const tempC = num(row.tempC);
  const timeMin = num(row.timeMin);
  const days = num(row.days);
  switch (row.type) {
    case "BOIL":
      return { ...withNum("timeMin", timeMin) };
    case "COOL":
      return { ...withNum("targetTempC", tempC) };
    case "FERMENT":
    case "CONDITION":
      return { ...withNum("tempC", tempC), ...withNum("days", days) };
    case "STABILIZE":
      // Schéma `stabilizeParams` : method?/tempC?/notes? — on porte la température.
      return { ...withNum("tempC", tempC) };
    default:
      return {}; // PACKAGE, OTHER (ex. macération libre)
  }
}

export function toStepInputs(state: AltFormState): RecipeStepInput[] {
  return state.steps.map((row) => ({
    type: row.type,
    ...(row.name.trim() ? { name: row.name.trim() } : {}),
    params: stepParams(row),
  }));
}

/** Patch des détails ALT persistés. `null` efface la stabilisation (schéma nullish). */
export function altDetailsPatch(state: AltFormState): Partial<AltDetails> {
  const patch: Partial<AltDetails> = {
    stabilizationMethod: state.stabilizationMethod === "" ? null : state.stabilizationMethod,
    residualSugarRisk: state.residualSugarRisk,
  };
  // `baseType` est requis (`z.string().min(1)`) → omis plutôt qu'envoyé vide.
  if (state.baseType.trim() !== "") patch.baseType = state.baseType;
  // targetPh/batchVolumeL ne sont pas nullables côté schéma → omis si vides.
  const ph = num(state.targetPh);
  if (ph !== undefined) patch.targetPh = ph;
  const volume = num(state.batchVolumeL);
  if (volume !== undefined && volume > 0) patch.batchVolumeL = volume;
  return patch;
}

// ── Fabriques de lignes vides (bouton « Ajouter ») ───────────────────────────

export const emptySugar = (): SugarRow => ({
  key: newRowKey("sugar"),
  catalogItemId: null,
  name: "",
  amountG: "",
});

export const emptyYeast = (): YeastRow => ({
  key: newRowKey("yeast"),
  catalogItemId: null,
  name: "",
  attenuationPct: "",
  amountG: "",
});

export const emptyAdjunct = (): AdjunctRow => ({
  key: newRowKey("adjunct"),
  catalogItemId: null,
  name: "",
  amountG: "",
});

export const emptyStep = (type: ProcessStepType): AltStepRow => ({
  key: newRowKey("step"),
  type,
  name: "",
  tempC: "",
  timeMin: "",
  days: "",
});
