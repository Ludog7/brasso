import type {
  IngredientCategory,
  ProcessStepType,
  StabilizationMethod,
  StockUnit,
  StorageMode,
} from "@brasso/core";

import type { RecipeCreateInput, RecipeEngine, RecipeStatus } from "@/lib/api";

/**
 * Correspondances **UI → domaine** du module recettes. La liste des « types de
 * boisson » est un concept purement front (spec fonctionnelle « Comportement
 * UI ») : à la création, le type choisi détermine le moteur de calcul proposé
 * (API `engine`). Les trois moteurs seuls existent côté serveur.
 */

/** Libellés FR des moteurs de calcul (API `RecipeEngine`). */
export const ENGINE_LABELS: Record<RecipeEngine, string> = {
  BEER: "Bière",
  ALT_FERMENTED: "Fermenté alternatif",
  SOFT_DRINK: "Sans alcool",
};

/** Libellés FR du cycle de vie (API `RecipeStatus`). */
export const STATUS_LABELS: Record<RecipeStatus, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publiée",
  ARCHIVED: "Archivée",
};

/** Ton du badge de statut (aligné sur `ui/badge`). */
export const STATUS_TONE: Record<RecipeStatus, "neutral" | "success" | "muted"> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "muted",
};

/** Libellés FR des méthodes de stabilisation (enum core `StabilizationMethod`). */
export const STABILIZATION_LABELS: Record<StabilizationMethod, string> = {
  PASTEURIZATION: "Pasteurisation",
  THERMAL: "Traitement thermique",
  COLD_CHAIN: "Chaîne du froid",
  FILTRATION_ACIDIFICATION: "Filtration + acidification",
  CHEMICAL: "Stabilisation chimique",
  OTHER: "Autre méthode",
};

/** Libellés FR des modes de conservation (enum core `StorageMode`). */
export const STORAGE_MODE_LABELS: Record<StorageMode, string> = {
  cold: "Chaîne du froid",
  ambient: "Température ambiante",
};

/** Libellés FR des catégories d'ingrédient (enum core `IngredientCategory`). */
export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  MALT: "Malt",
  SUGAR: "Sucre",
  HOP: "Houblon",
  YEAST: "Levure",
  ADJUNCT: "Ingrédient additionnel",
};

/** Libellés FR des types d'étape de process (enum core `ProcessStepType`). */
export const STEP_TYPE_LABELS: Record<ProcessStepType, string> = {
  MASH: "Empâtage",
  MASH_STEP: "Palier d'empâtage",
  SPARGE: "Rinçage",
  BOIL: "Ébullition",
  WHIRLPOOL: "Whirlpool",
  COOL: "Refroidissement",
  FERMENT: "Fermentation",
  STABILIZE: "Stabilisation",
  CONDITION: "Maturation",
  PACKAGE: "Conditionnement",
  OTHER: "Autre",
};

/** Libellés FR courts des unités de stock (enum core `StockUnit`). */
export const UNIT_LABELS: Record<StockUnit, string> = {
  GRAM: "g",
  LITER: "L",
  UNIT: "u",
};

/** Type de boisson proposé à la création (concept UI). */
export type DrinkType =
  "BIERE" | "GINGER_BEER" | "HYDROMEL" | "KOMBUCHA" | "FERMENTE_SANS_ALCOOL" | "LIMONADE";

interface DrinkTypeOption {
  value: DrinkType;
  label: string;
  /** Moteur de calcul proposé pour ce type de boisson. */
  engine: RecipeEngine;
}

/**
 * Catalogue des types de boisson et moteur associé (ordre d'affichage) :
 * bière → BEER ; fermentés alternatifs → ALT_FERMENTED ; non fermentés →
 * SOFT_DRINK. Pour un moteur ALT_FERMENTED, le type de boisson sert de
 * `baseType` (obligatoire côté API).
 */
export const DRINK_TYPES: readonly DrinkTypeOption[] = [
  { value: "BIERE", label: "Bière", engine: "BEER" },
  { value: "GINGER_BEER", label: "Ginger beer", engine: "ALT_FERMENTED" },
  { value: "HYDROMEL", label: "Hydromel", engine: "ALT_FERMENTED" },
  { value: "KOMBUCHA", label: "Kombucha", engine: "ALT_FERMENTED" },
  { value: "FERMENTE_SANS_ALCOOL", label: "Fermenté sans alcool", engine: "ALT_FERMENTED" },
  { value: "LIMONADE", label: "Limonade", engine: "SOFT_DRINK" },
];

const DRINK_TYPE_BY_VALUE = new Map<DrinkType, DrinkTypeOption>(
  DRINK_TYPES.map((option) => [option.value, option]),
);

/** Moteur de calcul associé à un type de boisson. */
export function engineForDrinkType(type: DrinkType): RecipeEngine {
  const option = DRINK_TYPE_BY_VALUE.get(type);
  if (!option) {
    throw new Error(`Type de boisson inconnu : ${type}`);
  }
  return option.engine;
}

/**
 * Construit le corps de création API à partir du type de boisson choisi et du
 * nom. Un moteur ALT_FERMENTED exige un `baseType` : le type de boisson en tient
 * lieu. BEER/SOFT partent sans détail (le serveur applique les défauts).
 */
export function createInputForDrinkType(type: DrinkType, name: string): RecipeCreateInput {
  switch (engineForDrinkType(type)) {
    case "BEER":
      return { engine: "BEER", name };
    case "SOFT_DRINK":
      return { engine: "SOFT_DRINK", name };
    case "ALT_FERMENTED":
      return { engine: "ALT_FERMENTED", name, altDetails: { baseType: type } };
  }
}
