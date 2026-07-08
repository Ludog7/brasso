/**
 * Projection **éditeur ↔ moteur** du SOFT_DRINK_ENGINE (limonades, boissons sucrées
 * non fermentées). L'état d'édition est saisi en chaînes (champs contrôlés) ; ce
 * module le reprojette d'un côté vers l'entrée pure `SoftRecipe` de `@brasso/core`
 * (`computeSoftDrink`), de l'autre vers les inputs de persistance
 * (`RecipeIngredientInput`/`RecipeStepInput`, M2-02).
 *
 * Aucune formule ici (règle FORMULES-BRASSICOLES.md) : uniquement du transport de
 * données. Contrairement à l'ALT, **tout ce qu'exige le panneau est persisté**
 * (`sugarConcentration`, `targetPh`, `storageMode`, `stabilizationMethod` sont des
 * colonnes de `RecipeSoftDetails`) : pas d'hypothèses d'estimation transientes.
 * Le moteur ne calcule ni ABV, ni IBU, ni EBC.
 */

import type {
  ProcessStepType,
  RecipeIngredientInput,
  RecipeStepInput,
  SoftRecipe,
  StabilizationMethod,
  StorageMode,
} from "@brasso/core";

import type { RecipeDetail, SoftDetails } from "@/lib/api";

// ── Modèle d'édition (champs en chaînes) ─────────────────────────────────────

export interface SugarRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  amountG: string;
}

/** Ingrédient non standard : jus, arôme, acidifiant, extrait… (catégorie ADJUNCT). */
export interface AdjunctRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  amountG: string;
}

export interface SoftStepRow {
  key: string;
  type: ProcessStepType;
  name: string;
  tempC: string;
  timeMin: string;
}

/** État persisté d'un brouillon SOFT_DRINK. */
export interface SoftFormState {
  name: string;
  description: string;
  /** Concentration en sucre (g/L) — indicateur clé du moteur. */
  sugarConcentration: string;
  /** pH visé (imposé pour publier — ADR-06) ; pilote l'indicateur pH. */
  targetPh: string;
  /** Mode de conservation ; « ambiant » + pH > 4,6 → stabilisation requise. */
  storageMode: StorageMode | "";
  stabilizationMethod: StabilizationMethod | "";
  batchVolumeL: string;
  sugars: SugarRow[];
  adjuncts: AdjunctRow[];
  steps: SoftStepRow[];
}

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

export function softStateFromRecipe(recipe: RecipeDetail): SoftFormState {
  const details = recipe.softDetails;
  const sugars: SugarRow[] = [];
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
      case "ADJUNCT":
        adjuncts.push({
          key: newRowKey("adjunct"),
          catalogItemId: ing.catalogItemId,
          name: ing.name,
          amountG: fmt(ing.amount),
        });
        break;
      // MALT/HOP/YEAST non pertinents pour SOFT (ingredientCategoriesByEngine) — ignorés.
    }
  }

  const steps: SoftStepRow[] = recipe.steps.map((step) => ({
    key: newRowKey("step"),
    type: step.type,
    name: step.name ?? "",
    tempC: fmt(readNum(step.params, "tempC") ?? readNum(step.params, "targetTempC")),
    timeMin: fmt(readNum(step.params, "timeMin")),
  }));

  return {
    name: recipe.name,
    description: recipe.notes ?? "",
    sugarConcentration: fmt(details?.sugarConcentration),
    targetPh: fmt(details?.targetPh),
    storageMode: (details?.storageMode ?? "") as StorageMode | "",
    stabilizationMethod: (details?.stabilizationMethod ?? "") as StabilizationMethod | "",
    batchVolumeL: fmt(details?.batchVolumeL),
    sugars,
    adjuncts,
    steps,
  };
}

// ── Projection vers l'entrée moteur `computeSoftDrink` ───────────────────────

/**
 * Recette moteur pour `computeSoftDrink`. Tous les champs proviennent des détails
 * persistés — aucun repli ni hypothèse transiente : le moteur SOFT ne calcule pas
 * de densités. Les champs vides restent omis (`undefined`), traités par le moteur.
 */
export function toSoftRecipe(form: SoftFormState): SoftRecipe {
  const sugar = num(form.sugarConcentration);
  const ph = num(form.targetPh);

  return {
    engine: "SOFT_DRINK",
    ...(sugar !== undefined ? { sugarConcentrationGPerL: sugar } : {}),
    ...(ph !== undefined ? { ph } : {}),
    ...(form.storageMode !== "" ? { storageMode: form.storageMode } : {}),
    stabilizationMethod: form.stabilizationMethod === "" ? null : form.stabilizationMethod,
  };
}

// ── Projection vers les inputs de persistance (M2-02) ────────────────────────

export function toIngredientInputs(state: SoftFormState): RecipeIngredientInput[] {
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

/** Construit les `params` d'une étape SOFT selon son type (schémas M2-02). */
function stepParams(row: SoftStepRow): Record<string, unknown> {
  const tempC = num(row.tempC);
  const timeMin = num(row.timeMin);
  switch (row.type) {
    case "BOIL":
      return { ...withNum("timeMin", timeMin) };
    case "COOL":
      return { ...withNum("targetTempC", tempC) };
    case "STABILIZE":
      // Schéma `stabilizeParams` : method?/tempC?/notes? — on porte la température.
      return { ...withNum("tempC", tempC) };
    default:
      return {}; // PACKAGE, OTHER (ex. macération/infusion libre)
  }
}

export function toStepInputs(state: SoftFormState): RecipeStepInput[] {
  return state.steps.map((row) => ({
    type: row.type,
    ...(row.name.trim() ? { name: row.name.trim() } : {}),
    params: stepParams(row),
  }));
}

/**
 * Patch des détails SOFT persistés. `null` efface la stabilisation (schéma nullish) ;
 * les champs numériques non-nullables (`sugarConcentration`, `targetPh`, `storageMode`,
 * `batchVolumeL`) sont **omis** si vides (jamais envoyés `null` — cf. pattern §6).
 */
export function softDetailsPatch(state: SoftFormState): Partial<SoftDetails> {
  const patch: Partial<SoftDetails> = {
    stabilizationMethod: state.stabilizationMethod === "" ? null : state.stabilizationMethod,
  };
  const sugar = num(state.sugarConcentration);
  if (sugar !== undefined && sugar >= 0) patch.sugarConcentration = sugar;
  const ph = num(state.targetPh);
  if (ph !== undefined) patch.targetPh = ph;
  if (state.storageMode !== "") patch.storageMode = state.storageMode;
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

export const emptyAdjunct = (): AdjunctRow => ({
  key: newRowKey("adjunct"),
  catalogItemId: null,
  name: "",
  amountG: "",
});

export const emptyStep = (type: ProcessStepType): SoftStepRow => ({
  key: newRowKey("step"),
  type,
  name: "",
  tempC: "",
  timeMin: "",
});
