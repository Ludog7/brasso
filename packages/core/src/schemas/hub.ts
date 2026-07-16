/**
 * Schémas Zod du **hub caisse** (Prisma `ExternalTransaction` / `SkuMapping` /
 * `IntegrationAlert`, M1-01, §3.6). ADR-04 (Zod dans core) / ADR-03 (zéro DB/UI).
 *
 * Montants en **centimes entiers** (unité interne monnaie, CLAUDE.md). La
 * normalisation **spécifique** des payloads SumUp/Zettle vit côté API (M7-03) ;
 * `core` ne porte que la **forme normalisée cible** (`externalSaleSchema`).
 */

import { z } from "zod";

import { integrationAlertStatusSchema, integrationAlertTypeSchema } from "./enums.js";

/**
 * Forme **normalisée cible** d'une vente externe (M7-03 doit produire cette
 * forme). Montant en centimes entiers ≥ 0, date de survenue en `Date` (ISO à la
 * sérialisation). `externalProductId` absent → vente non mappable (mode dégradé).
 */
export const externalSaleSchema = z.object({
  externalId: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().min(1).default("EUR"),
  paymentMethod: z.string().min(1).optional(),
  externalProductId: z.string().min(1).optional(),
  itemLabel: z.string().min(1).optional(),
  occurredAt: z.coerce.date(),
});

/** Saisie d'une correspondance SKU interne ↔ produit externe (§3.6). */
export const skuMappingInputSchema = z.object({
  internalSku: z.string().min(1),
  /** Article de catalogue rattaché ; `null`/absent → mapping incomplet (pas de mouvement). */
  catalogItemId: z.string().min(1).nullable().optional(),
  providerId: z.string().min(1),
  externalProductId: z.string().min(1),
  externalCategory: z.string().min(1).optional(),
});

/** Correspondance SKU persistée (miroir de la vue API : entrée + identité). */
export const skuMappingSchema = skuMappingInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/**
 * Anomalie d'intégration (transaction non mappée / webhook en échec, §3.6). Le
 * `message` est un texte libre lisible (voir `resolveSaleReconciliation`).
 */
export const integrationAlertSchema = z.object({
  type: integrationAlertTypeSchema,
  status: integrationAlertStatusSchema.default("OPEN"),
  message: z.string().min(1),
  providerId: z.string().min(1).optional(),
  transactionId: z.string().min(1).optional(),
});

export type ExternalSaleInput = z.infer<typeof externalSaleSchema>;
export type SkuMappingInput = z.infer<typeof skuMappingInputSchema>;
export type SkuMapping = z.infer<typeof skuMappingSchema>;
export type IntegrationAlertInput = z.infer<typeof integrationAlertSchema>;
