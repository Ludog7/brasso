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

/** Type d'étape de process d'une recette (Prisma `ProcessStepType`). */
export const processStepTypeSchema = z.enum([
  "MASH",
  "MASH_STEP",
  "SPARGE",
  "BOIL",
  "WHIRLPOOL",
  "COOL",
  "FERMENT",
  "STABILIZE",
  "CONDITION",
  "PACKAGE",
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

/** Statut de cotisation d'un membre (Prisma `MembershipStatus`, §3.4). */
export const membershipStatusSchema = z.enum(["A_JOUR", "EN_RETARD"]);

/** Type de consentement RGPD historisé (Prisma `ConsentType`, §3.4). */
export const consentTypeSchema = z.enum(["COMMUNICATION", "PHOTOS", "NOTIFICATIONS_LEGALES"]);

/** Fonction associative d'un membre (Prisma `AssociativeRole`, ≠ rôles RBAC §3.5). */
export const associativeRoleSchema = z.enum([
  "ADHERENT",
  "BRASSEUR",
  "CA",
  "TRESORIER",
  "REFERENT_RGPD",
]);

/** Fournisseur externe branché au hub caisse (Prisma `ExternalProviderKind`, ADR-09). */
export const externalProviderKindSchema = z.enum(["HELLOASSO", "SUMUP", "ZETTLE"]);

/** Nature normalisée d'une transaction externe (Prisma `ExternalTransactionKind`). */
export const externalTransactionKindSchema = z.enum(["SALE", "MEMBERSHIP", "DONATION", "OTHER"]);

/** Statut de rapprochement d'une transaction externe (Prisma `ExternalTransactionStatus`, §3.6). */
export const externalTransactionStatusSchema = z.enum(["MAPPED", "UNMAPPED", "IGNORED"]);

/** Type d'anomalie d'intégration (Prisma `IntegrationAlertType`, dashboard anomalies §3.6). */
export const integrationAlertTypeSchema = z.enum([
  "UNMAPPED_TRANSACTION",
  "WEBHOOK_FAILURE",
  "OTHER",
]);

/** Statut d'une anomalie d'intégration (Prisma `IntegrationAlertStatus`). */
export const integrationAlertStatusSchema = z.enum(["OPEN", "RESOLVED"]);

/** Mode de rendu d'un écran d'affichage (Prisma `DisplayTemplate`, M7-02, §Templates). */
export const displayTemplateSchema = z.enum(["LIST", "TABLE", "CARDS"]);

export type RecipeEngine = z.infer<typeof recipeEngineSchema>;
export type RecipeStatus = z.infer<typeof recipeStatusSchema>;
export type IngredientCategory = z.infer<typeof ingredientCategorySchema>;
export type IngredientUse = z.infer<typeof ingredientUseSchema>;
export type ProcessStepType = z.infer<typeof processStepTypeSchema>;
export type BatchStatus = z.infer<typeof batchStatusSchema>;
export type MeasureType = z.infer<typeof measureTypeSchema>;
export type CatalogKind = z.infer<typeof catalogKindSchema>;
export type StockUnit = z.infer<typeof stockUnitSchema>;
export type StockMovementReason = z.infer<typeof stockMovementReasonSchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type ConsentType = z.infer<typeof consentTypeSchema>;
export type AssociativeRole = z.infer<typeof associativeRoleSchema>;
export type ExternalProviderKind = z.infer<typeof externalProviderKindSchema>;
export type ExternalTransactionKind = z.infer<typeof externalTransactionKindSchema>;
export type ExternalTransactionStatus = z.infer<typeof externalTransactionStatusSchema>;
export type IntegrationAlertType = z.infer<typeof integrationAlertTypeSchema>;
export type IntegrationAlertStatus = z.infer<typeof integrationAlertStatusSchema>;
export type DisplayTemplate = z.infer<typeof displayTemplateSchema>;
