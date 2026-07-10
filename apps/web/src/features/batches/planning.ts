/**
 * Aperçu de planification (M3-08) — dérivations **pures** (non stockées) pour
 * l'écran de planification : grist depuis le snapshot de recette, volumes via
 * `computeBrewWaterPlan` (@brasso/core, M3-01) et liste des réservations de stock
 * prévues. Aide à la décision uniquement (les valeurs faisant foi sont recalculées
 * côté serveur à la création).
 */

import { type BrewWaterPlan, computeBrewWaterPlan } from "@brasso/core";

import type { EquipmentProfile, RecipeDetail } from "@/lib/api";

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
