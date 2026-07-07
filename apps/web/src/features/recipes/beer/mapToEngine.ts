/**
 * Projection **éditeur ↔ moteur** du BEER_ENGINE. L'état d'édition est saisi en
 * chaînes (champs contrôlés) ; ce module le reprojette d'un côté vers l'entrée
 * pure `BeerRecipe` de `@brasso/core` (`computeBeer`), de l'autre vers les inputs
 * de persistance (`RecipeIngredientInput`/`RecipeStepInput`, M2-02).
 *
 * Aucune formule ici (règle FORMULES-BRASSICOLES.md) : uniquement du transport de
 * données et des valeurs par défaut d'unités internes (g, L, SG brute, EBC, α en
 * fraction). Les grandeurs calculées restent dérivées, jamais stockées.
 */

import type {
  BeerRecipe,
  BjcpStyle,
  HopAddition,
  HopForm,
  IngredientUse,
  ProcessStepType,
  RecipeFermentable,
  RecipeIngredientInput,
  RecipeStepInput,
} from "@brasso/core";

import type { RecipeDetail } from "@/lib/api";

// Valeurs par défaut (unités internes) quand un intrant n'est pas renseigné.
export const DEFAULT_EFFICIENCY_PCT = 72;
export const DEFAULT_ATTENUATION_PCT = 75;
export const DEFAULT_MALT_POTENTIAL_SG = 1.037;
/** Sucres considérés fermentescibles à 100 % (saccharose ≈ 1.046, seed catalogue). */
export const DEFAULT_SUGAR_POTENTIAL_SG = 1.046;

/** Moment d'emploi d'un houblon proposé à l'UI (sous-ensemble de `IngredientUse`). */
export type HopUseUi = "BOIL" | "FIRST_WORT" | "WHIRLPOOL" | "DRY_HOP";
export const HOP_USES: readonly HopUseUi[] = ["BOIL", "FIRST_WORT", "WHIRLPOOL", "DRY_HOP"];
export const HOP_FORMS: readonly HopForm[] = ["pellet", "cryo", "leaf", "plug"];

/** `IngredientUse` (persistance) → `HopUse` (calcul IBU, M1-06). */
const HOP_USE_TO_CALC = {
  BOIL: "boil",
  FIRST_WORT: "first_wort",
  WHIRLPOOL: "whirlpool",
  DRY_HOP: "dry_hop",
} as const;

// ── Modèle d'édition (champs en chaînes) ─────────────────────────────────────

export interface MaltRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  amountG: string;
  colorEbc: string;
  potentialSg: string;
}

export interface SugarRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  amountG: string;
  potentialSg: string;
  colorEbc: string;
}

export interface HopRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  amountG: string;
  /** Acides alpha affichés en pourcentage (ex. « 6.2 ») ; stockés en fraction. */
  alphaPct: string;
  timeMin: string;
  use: HopUseUi;
  form: HopForm | "";
}

export interface YeastRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  attenuationPct: string;
  amountG: string;
}

export interface AdjunctRow {
  key: string;
  catalogItemId: string | null;
  name: string;
  amountG: string;
}

export interface StepRow {
  key: string;
  type: ProcessStepType;
  name: string;
  tempC: string;
  timeMin: string;
  days: string;
}

export interface BeerFormState {
  name: string;
  description: string;
  styleCode: string;
  batchVolumeL: string;
  boilTimeMin: string;
  /** Rendement de brassage en pourcentage (converti en fraction à la persistance). */
  efficiencyPct: string;
  malts: MaltRow[];
  sugars: SugarRow[];
  hops: HopRow[];
  yeasts: YeastRow[];
  adjuncts: AdjunctRow[];
  steps: StepRow[];
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

function readStr(params: unknown, key: string): string | undefined {
  if (params && typeof params === "object" && key in params) {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function hopUseUi(use: IngredientUse | null): HopUseUi {
  return use === "FIRST_WORT" || use === "WHIRLPOOL" || use === "DRY_HOP" ? use : "BOIL";
}

function hopForm(value: string | undefined): HopForm | "" {
  const lower = value?.toLowerCase();
  return HOP_FORMS.find((f) => f === lower) ?? "";
}

// ── Dérivation de l'état d'édition depuis une recette chargée ─────────────────

export function beerStateFromRecipe(recipe: RecipeDetail): BeerFormState {
  const details = recipe.beerDetails;
  const malts: MaltRow[] = [];
  const sugars: SugarRow[] = [];
  const hops: HopRow[] = [];
  const yeasts: YeastRow[] = [];
  const adjuncts: AdjunctRow[] = [];

  for (const ing of recipe.ingredients) {
    switch (ing.category) {
      case "MALT":
        malts.push({
          key: newRowKey("malt"),
          catalogItemId: ing.catalogItemId,
          name: ing.name,
          amountG: fmt(ing.amount),
          colorEbc: fmt(readNum(ing.params, "colorEbc")),
          potentialSg: fmt(readNum(ing.params, "potentialSg")),
        });
        break;
      case "SUGAR":
        sugars.push({
          key: newRowKey("sugar"),
          catalogItemId: ing.catalogItemId,
          name: ing.name,
          amountG: fmt(ing.amount),
          potentialSg: fmt(readNum(ing.params, "potentialSg")),
          colorEbc: fmt(readNum(ing.params, "colorEbc")),
        });
        break;
      case "HOP":
        hops.push({
          key: newRowKey("hop"),
          catalogItemId: ing.catalogItemId,
          name: ing.name,
          amountG: fmt(ing.amount),
          alphaPct: fmt(mulOrUndef(readNum(ing.params, "alphaFraction"), 100)),
          timeMin: fmt(ing.timeMinutes),
          use: hopUseUi(ing.use),
          form: hopForm(readStr(ing.params, "form")),
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
    }
  }

  const steps: StepRow[] = recipe.steps.map((step) => ({
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
    styleCode: details?.styleBjcp ?? "",
    batchVolumeL: fmt(details?.batchVolumeL),
    boilTimeMin: fmt(details?.boilTimeMin),
    efficiencyPct: fmt(mulOrUndef(details?.efficiency, 100)),
    malts,
    sugars,
    hops,
    yeasts,
    adjuncts,
    steps,
  };
}

function mulOrUndef(value: number | null | undefined, factor: number): number | undefined {
  return value == null ? undefined : value * factor;
}

// ── Projection vers l'entrée moteur `computeBeer` ────────────────────────────

/** Une ligne « compte » (calcul + persistance) dès qu'elle porte un nom. */
const named = <T extends { name: string }>(row: T): boolean => row.name.trim().length > 0;

/**
 * Recette moteur pour `computeBeer`. Le volume d'ébullition n'étant pas stocké,
 * il est approximé au volume final (pas de modèle d'évaporation à ce stade) →
 * boil gravity ≈ OG. `style` fournit les bornes BJCP des jauges (si un style est
 * sélectionné et résolu).
 */
export function toBeerRecipe(state: BeerFormState, style?: BjcpStyle): BeerRecipe {
  const batchVolumeL = numOr(state.batchVolumeL, 0);

  const fermentables: RecipeFermentable[] = [
    ...state.malts.filter(named).map((m) => ({
      potentialSg: numOr(m.potentialSg, DEFAULT_MALT_POTENTIAL_SG),
      amountG: numOr(m.amountG, 0),
      isMashable: true,
      colorEbc: numOr(m.colorEbc, 0),
    })),
    ...state.sugars.filter(named).map((s) => ({
      potentialSg: numOr(s.potentialSg, DEFAULT_SUGAR_POTENTIAL_SG),
      amountG: numOr(s.amountG, 0),
      isMashable: false,
      colorEbc: numOr(s.colorEbc, 0),
    })),
  ];

  const hops: HopAddition[] = state.hops.filter(named).map((h) => ({
    alphaFraction: numOr(h.alphaPct, 0) / 100,
    amountG: numOr(h.amountG, 0),
    timeMin: numOr(h.timeMin, 0),
    use: HOP_USE_TO_CALC[h.use],
    ...(h.form ? { form: h.form } : {}),
  }));

  const firstYeast = state.yeasts.find(named);

  return {
    engine: "BEER",
    fermentables,
    hops,
    efficiencyPct: numOr(state.efficiencyPct, DEFAULT_EFFICIENCY_PCT),
    batchVolumeL,
    boilVolumeL: batchVolumeL,
    yeastAttenuationPct: firstYeast
      ? numOr(firstYeast.attenuationPct, DEFAULT_ATTENUATION_PCT)
      : DEFAULT_ATTENUATION_PCT,
    ...(style ? { style } : {}),
  };
}

/** `computeBeer` exige un volume > 0 (division interdite) — garde du panneau. */
export function isComputable(state: BeerFormState): boolean {
  return numOr(state.batchVolumeL, 0) > 0;
}

// ── Projection vers les inputs de persistance (M2-02) ────────────────────────

export function toIngredientInputs(state: BeerFormState): RecipeIngredientInput[] {
  const out: RecipeIngredientInput[] = [];

  for (const m of state.malts.filter(named)) {
    out.push({
      category: "MALT",
      name: m.name.trim(),
      amount: numOr(m.amountG, 0),
      unit: "GRAM",
      ...(m.catalogItemId ? { catalogItemId: m.catalogItemId } : {}),
      params: {
        isMashable: true,
        ...withNum("colorEbc", num(m.colorEbc)),
        ...withNum("potentialSg", num(m.potentialSg)),
      },
    });
  }

  for (const s of state.sugars.filter(named)) {
    out.push({
      category: "SUGAR",
      name: s.name.trim(),
      amount: numOr(s.amountG, 0),
      unit: "GRAM",
      ...(s.catalogItemId ? { catalogItemId: s.catalogItemId } : {}),
      params: {
        ...withNum("potentialSg", num(s.potentialSg)),
        ...withNum("colorEbc", num(s.colorEbc)),
      },
    });
  }

  for (const h of state.hops.filter(named)) {
    out.push({
      category: "HOP",
      name: h.name.trim(),
      amount: numOr(h.amountG, 0),
      unit: "GRAM",
      use: h.use,
      ...(num(h.timeMin) !== undefined ? { timeMinutes: numOr(h.timeMin, 0) } : {}),
      ...(h.catalogItemId ? { catalogItemId: h.catalogItemId } : {}),
      params: {
        alphaFraction: numOr(h.alphaPct, 0) / 100,
        ...(h.form ? { form: h.form } : {}),
      },
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

function withNum(key: string, value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}

/** Construit les `params` d'une étape selon son type (schémas M2-02). */
function stepParams(row: StepRow): Record<string, unknown> {
  const tempC = num(row.tempC);
  const timeMin = num(row.timeMin);
  const days = num(row.days);
  switch (row.type) {
    case "MASH":
    case "MASH_STEP":
    case "WHIRLPOOL":
      return { ...withNum("tempC", tempC), ...withNum("timeMin", timeMin) };
    case "BOIL":
      return { ...withNum("timeMin", timeMin) };
    case "SPARGE":
      return { ...withNum("tempC", tempC) };
    case "COOL":
      return { ...withNum("targetTempC", tempC) };
    case "FERMENT":
    case "CONDITION":
      return { ...withNum("tempC", tempC), ...withNum("days", days) };
    default:
      return {};
  }
}

export function toStepInputs(state: BeerFormState): RecipeStepInput[] {
  return state.steps.map((row) => ({
    type: row.type,
    ...(row.name.trim() ? { name: row.name.trim() } : {}),
    params: stepParams(row),
  }));
}

// ── Fabriques de lignes vides (bouton « Ajouter ») ───────────────────────────

export const emptyMalt = (): MaltRow => ({
  key: newRowKey("malt"),
  catalogItemId: null,
  name: "",
  amountG: "",
  colorEbc: "",
  potentialSg: "",
});

export const emptySugar = (): SugarRow => ({
  key: newRowKey("sugar"),
  catalogItemId: null,
  name: "",
  amountG: "",
  potentialSg: "",
  colorEbc: "",
});

export const emptyHop = (): HopRow => ({
  key: newRowKey("hop"),
  catalogItemId: null,
  name: "",
  amountG: "",
  alphaPct: "",
  timeMin: "",
  use: "BOIL",
  form: "",
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

export const emptyStep = (type: ProcessStepType): StepRow => ({
  key: newRowKey("step"),
  type,
  name: "",
  tempC: "",
  timeMin: "",
  days: "",
});
