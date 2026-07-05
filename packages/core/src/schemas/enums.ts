/**
 * Enums Zod partagés — **alignés sur les enums Prisma** (M1-01, `schema.prisma`).
 *
 * ADR-04 : Zod vit dans `core`, réutilisé par l'API (Fastify) et le front. Source
 * unique de vérité des valeurs ; toute divergence avec Prisma est un bug (M1-01).
 * Zéro dépendance DB/UI (ADR-03) — les valeurs sont recopiées, pas importées.
 */

import { z } from "zod";

/** Moteur de calcul d'une recette (Prisma `RecipeEngine`). */
export const recipeEngineSchema = z.enum(["BEER", "ALT_FERMENTED", "SOFT_DRINK"]);

/** Cycle de vie d'une recette (Prisma `RecipeStatus`). `PUBLISHED` immuable (ADR-06). */
export const recipeStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

/** Méthode de stabilisation (Prisma `StabilizationMethod`). */
export const stabilizationMethodSchema = z.enum([
  "PASTEURIZATION",
  "THERMAL",
  "COLD_CHAIN",
  "FILTRATION_ACIDIFICATION",
  "CHEMICAL",
  "OTHER",
]);

/** Catégorie d'ingrédient (Prisma `IngredientCategory`). */
export const ingredientCategorySchema = z.enum(["MALT", "SUGAR", "HOP", "YEAST", "ADJUNCT"]);

/** Moment d'emploi d'un ingrédient (Prisma `IngredientUse`). */
export const ingredientUseSchema = z.enum([
  "MASH",
  "FIRST_WORT",
  "BOIL",
  "WHIRLPOOL",
  "DRY_HOP",
  "PRIMARY",
  "SECONDARY",
  "BOTTLING",
  "OTHER",
]);

/** Statut d'un batch (Prisma `BatchStatus`). */
export const batchStatusSchema = z.enum([
  "PLANIFIE",
  "EN_BRASSAGE",
  "EN_FERMENTATION",
  "EN_CONDITIONNEMENT",
  "TERMINE",
  "ANNULE",
]);

/** Nature d'une mesure relevée sur un batch (Prisma `MeasureType`). */
export const measureTypeSchema = z.enum(["GRAVITY", "TEMPERATURE", "PH", "VOLUME", "OTHER"]);

/** Logique de stock d'un article (Prisma `CatalogKind`). */
export const catalogKindSchema = z.enum(["RECETTE", "BULK", "CONDITIONNEMENT"]);

/** Unité de stock (Prisma `StockUnit`). Unités internes g/L ; `UNIT` = comptable. */
export const stockUnitSchema = z.enum(["GRAM", "LITER", "UNIT"]);

/** Motif d'un mouvement de stock (Prisma `StockMovementReason`). */
export const stockMovementReasonSchema = z.enum([
  "PURCHASE",
  "PRODUCTION",
  "ADJUSTMENT",
  "INVENTORY",
  "SALE",
  "LOSS",
  "RETURN",
  "OTHER",
]);

/** Cycle de vie d'une réservation de stock (Prisma `ReservationStatus`). */
export const reservationStatusSchema = z.enum(["RESERVED", "CONSUMED", "RELEASED"]);

/**
 * Mode de conservation d'une boisson (froid / ambiant) — indicateur sécurité
 * (ADR-11). Prisma stocke `storageMode` en `String` libre ; `core` le contraint.
 */
export const storageModeSchema = z.enum(["cold", "ambient"]);

export type RecipeEngine = z.infer<typeof recipeEngineSchema>;
export type RecipeStatus = z.infer<typeof recipeStatusSchema>;
export type IngredientCategory = z.infer<typeof ingredientCategorySchema>;
export type IngredientUse = z.infer<typeof ingredientUseSchema>;
export type BatchStatus = z.infer<typeof batchStatusSchema>;
export type MeasureType = z.infer<typeof measureTypeSchema>;
export type CatalogKind = z.infer<typeof catalogKindSchema>;
export type StockUnit = z.infer<typeof stockUnitSchema>;
export type StockMovementReason = z.infer<typeof stockMovementReasonSchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
