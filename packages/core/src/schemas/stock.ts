/**
 * Schémas Zod du **catalogue & stock** (Prisma `CatalogItem` / `StockLot` /
 * `StockMovement` / `StockReservation`, M1-01, §3.3). ADR-04/ADR-03.
 */

import { z } from "zod";

import {
  catalogKindSchema,
  ingredientCategorySchema,
  reservationStatusSchema,
  stockMovementReasonSchema,
  stockUnitSchema,
} from "./enums.js";

/**
 * Article de catalogue. Un article `RECETTE` doit porter une catégorie
 * d'ingrédient (cohérent Prisma / logique de stock §3.3).
 */
export const catalogItemSchema = z
  .object({
    name: z.string().min(1),
    kind: catalogKindSchema,
    category: ingredientCategorySchema.optional(),
    unit: stockUnitSchema.default("GRAM"),
    /** Détail spécifique (EBC des malts, AA des houblons…), validé au cas par cas. */
    attributes: z.record(z.unknown()).optional(),
    /** Coût unitaire de référence (centimes). */
    defaultUnitCostCents: z.number().int().nonnegative().optional(),
    reorderThreshold: z.number().nonnegative().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((item, ctx) => {
    if (item.kind === "RECETTE" && item.category === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Un article RECETTE doit porter une catégorie d'ingrédient (M1-01).",
      });
    }
  });

/** Lot physique d'un article (quantité, DLU, coût d'achat). */
export const stockLotSchema = z.object({
  catalogItemId: z.string().min(1),
  lotCode: z.string().optional(),
  quantity: z.number().nonnegative().default(0),
  bestBeforeAt: z.coerce.date().optional(),
  /** Coût unitaire à l'achat (centimes). */
  unitCostCents: z.number().int().nonnegative().optional(),
});

/**
 * Mouvement de stock (registre APPEND-ONLY §3.3). `delta` signé et **non nul**,
 * dans l'unité de l'article.
 */
export const stockMovementSchema = z
  .object({
    catalogItemId: z.string().min(1),
    stockLotId: z.string().min(1).optional(),
    delta: z.number().finite(),
    reason: stockMovementReasonSchema,
    batchId: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .refine((m) => m.delta !== 0, {
    path: ["delta"],
    message: "Un mouvement de stock doit avoir un delta non nul.",
  });

/** Réservation de stock (posée à la planification d'un batch, §3.3). */
export const stockReservationSchema = z.object({
  catalogItemId: z.string().min(1),
  batchId: z.string().min(1),
  quantity: z.number().positive(),
  status: reservationStatusSchema.default("RESERVED"),
});

export type CatalogItemInput = z.infer<typeof catalogItemSchema>;
export type StockLotInput = z.infer<typeof stockLotSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type StockReservationInput = z.infer<typeof stockReservationSchema>;
