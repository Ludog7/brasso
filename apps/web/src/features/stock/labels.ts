/**
 * Libellés FR de l'écran Stock (M5-07). Valeurs d'enum recopiées de l'API/`core`
 * (mêmes littéraux) — un seul point de traduction pour les vues stock.
 */

import type { CatalogKind, IngredientCategory, StockUnit } from "@brasso/core";

import type { ManualMovementReason } from "@/lib/api";

export const KIND_LABELS: Record<CatalogKind, string> = {
  RECETTE: "Recette",
  BULK: "Vrac",
  CONDITIONNEMENT: "Conditionnement",
  PRODUIT_FINI: "Produit fini",
};

export const UNIT_LABELS: Record<StockUnit, string> = {
  GRAM: "g",
  LITER: "L",
  UNIT: "u",
};

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  MALT: "Malt",
  SUGAR: "Sucre",
  HOP: "Houblon",
  YEAST: "Levure",
  ADJUNCT: "Adjuvant",
};

/** Motifs de mouvement **manuel** (PRODUCTION/SALE exclus, réservés batch/caisse). */
export const MOVEMENT_REASON_LABELS: Record<ManualMovementReason, string> = {
  PURCHASE: "Achat",
  ADJUSTMENT: "Ajustement",
  INVENTORY: "Inventaire",
  LOSS: "Perte",
  RETURN: "Retour",
  OTHER: "Autre",
};

/** Ordre d'affichage des motifs dans le menu de mouvement. */
export const MOVEMENT_REASONS: ManualMovementReason[] = [
  "PURCHASE",
  "ADJUSTMENT",
  "LOSS",
  "RETURN",
  "OTHER",
];
