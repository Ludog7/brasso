/**
 * Aperçu de planification (M3-08) — dérivations **pures** (non stockées) pour
 * l'écran de planification : grist depuis le snapshot de recette, volumes via
 * `computeBrewWaterPlan` (@brasso/core, M3-01) et liste des réservations de stock
 * prévues. Aide à la décision uniquement (les valeurs faisant foi sont recalculées
 * côté serveur à la création).
 */

import { type BrewWaterPlan, computeBrewWaterPlan } from "@brasso/core";

import type { BatchStatus, EquipmentProfile, RecipeDetail } from "@/lib/api";

/** Catégories comptées dans le grist empâté (grain solide). */
const GRAIN_CATEGORIES = new Set(["MALT", "ADJUNCT"]);

/** Masse de grain empâté (kg) : somme des ingrédients grain en grammes ÷ 1000. */
export function grainKgFromRecipe(recipe: RecipeDetail): number {
  const grams = recipe.ingredients.reduce((sum, ing) => {
    if (ing.unit === "GRAM" && GRAIN_CATEGORIES.has(ing.category)) return sum + ing.amount;
    return sum;
  }, 0);
  return grams / 1000;
}

/** Volume final visé (L) selon le moteur de la recette. */
export function batchVolumeLFromRecipe(recipe: RecipeDetail): number {
  const raw =
    recipe.beerDetails?.batchVolumeL ??
    recipe.altDetails?.batchVolumeL ??
    recipe.softDetails?.batchVolumeL ??
    0;
  return raw > 0 ? raw : 0;
}

/** Durée d'ébullition (min) — pertinente pour le moteur BEER uniquement. */
export function boilTimeMinFromRecipe(recipe: RecipeDetail): number {
  return recipe.beerDetails?.boilTimeMin ?? 0;
}

/** Assemble le plan d'eau/volumes depuis une recette + un profil d'équipement. */
export function computePlanPreview(recipe: RecipeDetail, profile: EquipmentProfile): BrewWaterPlan {
  return computeBrewWaterPlan({
    grainKg: grainKgFromRecipe(recipe),
    batchVolumeL: batchVolumeLFromRecipe(recipe),
    boilTimeMin: boilTimeMinFromRecipe(recipe),
    equipment: {
      deadspaceL: profile.deadspaceL,
      transferLossL: profile.transferLossL,
      evaporationRateLPerHour: profile.evaporationRateLPerHour,
      grainAbsorptionLPerKg: profile.grainAbsorptionLPerKg,
      nominalVolumeL: profile.nominalVolumeL,
    },
  });
}

/** Réservation prévue d'un ingrédient catalogué (agrégée par article). */
export interface PlannedReservation {
  catalogItemId: string;
  name: string;
  quantity: number;
  unit: string;
}

/**
 * Réservations de stock prévues (miroir de `resolveReservations` côté API) :
 * agrège les ingrédients à `catalogItemId` par article ; liste à part les
 * ingrédients hors catalogue (saisis à la main, non réservés).
 */
export function plannedReservations(recipe: RecipeDetail): {
  reservations: PlannedReservation[];
  unreserved: string[];
} {
  const byItem = new Map<string, PlannedReservation>();
  const unreserved: string[] = [];
  for (const ing of recipe.ingredients) {
    if (ing.catalogItemId == null) {
      unreserved.push(ing.name);
      continue;
    }
    const current = byItem.get(ing.catalogItemId);
    if (current) {
      current.quantity += ing.amount;
    } else {
      byItem.set(ing.catalogItemId, {
        catalogItemId: ing.catalogItemId,
        name: ing.name,
        quantity: ing.amount,
        unit: ing.unit,
      });
    }
  }
  return { reservations: [...byItem.values()], unreserved };
}

// ── Détail batch (M3-09) ──────────────────────────────────────────────────────

/**
 * Progression administrative linéaire (miroir de la règle serveur M3-06). Sert à
 * ne proposer côté UI **que** les transitions autorisées.
 */
const LINEAR_FLOW: readonly BatchStatus[] = [
  "PLANIFIE",
  "EN_BRASSAGE",
  "EN_FERMENTATION",
  "EN_CONDITIONNEMENT",
  "TERMINE",
];

/** Transitions autorisées depuis un statut : cran suivant + `ANNULE` (sauf terminal). */
export function allowedTransitions(from: BatchStatus): BatchStatus[] {
  const targets: BatchStatus[] = [];
  const index = LINEAR_FLOW.indexOf(from);
  const next = index >= 0 ? LINEAR_FLOW[index + 1] : undefined;
  if (next) targets.push(next);
  if (from !== "TERMINE" && from !== "ANNULE") targets.push("ANNULE");
  return targets;
}

/** Étape du plan de fermentation dérivée du snapshot (lecture seule, indicatif). */
export interface FermentationStep {
  type: string;
  name: string | null;
  tempC: number | null;
  /** Durée cible en jours (FERMENT/CONDITION) ou minutes (STABILIZE). */
  durationDays: number | null;
  durationMin: number | null;
}

/** Types d'étape retenus pour le plan de fermentation. */
const FERMENTATION_STEP_TYPES = new Set(["FERMENT", "CONDITION", "STABILIZE"]);

const readNum = (params: unknown, key: string): number | null => {
  if (params && typeof params === "object" && key in params) {
    const value = (params as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
};

/**
 * Dérive le plan de fermentation des étapes `FERMENT`/`CONDITION`/`STABILIZE` du
 * snapshot figé, ordonnées par `sortOrder`. Best-effort sur un JSON `unknown`.
 */
export function fermentationPlanFromSnapshot(snapshot: unknown): FermentationStep[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const steps = (snapshot as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];

  const rows = steps
    .filter(
      (s): s is Record<string, unknown> =>
        Boolean(s) &&
        typeof s === "object" &&
        typeof (s as { type?: unknown }).type === "string" &&
        FERMENTATION_STEP_TYPES.has((s as { type: string }).type),
    )
    .map((s) => ({
      type: s.type as string,
      name: typeof s.name === "string" ? s.name : null,
      sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : 0,
      tempC: readNum(s.params, "tempC"),
      durationDays: readNum(s.params, "days"),
      durationMin: readNum(s.params, "timeMin"),
    }));

  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(({ sortOrder: _s, ...step }) => step);
}
