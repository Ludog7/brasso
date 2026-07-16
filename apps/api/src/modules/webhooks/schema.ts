/**
 * Extraction **normalisée et défensive** d'un événement de cotisation entrant
 * (M6-07). Le webhook porte le payload brut du fournisseur ; on en tire les
 * champs de la colonne `ExternalTransaction` (append-only, ADR-09) sans jamais
 * perdre l'original (`rawPayload` conserve le JSON intégral, exploité par le
 * rapprochement M6-08 — notamment l'email du payeur).
 *
 * Le schéma HelloAsso réel n'étant pas testable sans compte (décision M6-00), ce
 * mapping est **provisoire** : forme documentée d'un « Order » HelloAsso (montants
 * en centimes). L'adaptateur définitif se confirmera sur un compte live ; la
 * vérification de signature (HMAC-SHA256) et l'idempotence, elles, sont figées.
 */

import { type ExternalSaleInput, externalSaleSchema } from "@brasso/core";
import { z } from "zod";

/** Événement de cotisation normalisé, prêt à persister en `ExternalTransaction`. */
export interface NormalizedMembershipEvent {
  /** Identifiant natif chez le fournisseur → idempotence `(providerId, externalId)`. */
  externalId: string;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  paymentMethod: string | null;
  /** Email du payeur (rapprochement M6-08). Conservé aussi intégralement en `rawPayload`. */
  payerEmail: string | null;
}

/**
 * Forme (provisoire) d'un événement HelloAsso : `data.id` natif, `data.amount`
 * en centimes, `data.date`. `passthrough` préserve les clés inconnues à la
 * validation — mais c'est le payload **brut** qui est stocké, pas cette projection.
 */
const helloAssoEventSchema = z
  .object({
    data: z
      .object({
        id: z.union([z.string(), z.number()]).transform((v) => String(v)),
        amount: z.object({
          total: z.number().int(),
          currency: z.string().min(1).default("EUR"),
        }),
        date: z.coerce.date(),
        paymentMeans: z.string().min(1).optional(),
        // Email non validé strictement : un format douteux ne doit pas casser
        // l'ingestion (le rapprochement échouera simplement) ; le brut reste conservé.
        payer: z.object({ email: z.string().optional() }).passthrough().optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Valide et projette un payload HelloAsso vers l'événement normalisé. Lève une
 * `ZodError` (→ 400) si les champs requis manquent — appelé **après** la
 * vérification de signature (on ne fait confiance au contenu qu'une fois signé).
 */
export function normalizeMembershipEvent(payload: unknown): NormalizedMembershipEvent {
  const { data } = helloAssoEventSchema.parse(payload);
  return {
    externalId: data.id,
    amountCents: data.amount.total,
    currency: data.amount.currency,
    occurredAt: data.date,
    paymentMethod: data.paymentMeans ?? null,
    payerEmail: data.payer?.email ?? null,
  };
}

/*
 * Normalisation SALE (M7-03) — chaque terminal a son schéma propre ; on projette
 * vers la forme normalisée cible `externalSaleSchema` de `@brasso/core` ({{M7-01}}).
 * Comme HelloAsso, ces schémas sont **provisoires** (non testables sans compte
 * live) : la signature (HMAC-SHA256), l'idempotence et la forme cible sont figées ;
 * le mapping de champs se confirmera sur un compte réel. Le payload **brut** reste
 * conservé intégralement en `rawPayload`. Extraction **tolérante** : une vente sans
 * `externalProductId` reste ingérée (elle deviendra une anomalie en {{M7-05}}).
 */

/** Ligne de produit du panier (commune aux deux terminaux, champs optionnels). */
const saleLineSchema = z
  .object({
    name: z.string().min(1).optional(),
  })
  .passthrough();

/**
 * Forme (provisoire) d'une vente **SumUp**. Particularité : les montants SumUp
 * sont en **unité majeure** (euros décimaux) → conversion en centimes entiers.
 * Référence produit du catalogue = `products[0].id` (clé du mapping {{M7-04}}).
 */
const sumUpSaleSchema = z
  .object({
    transaction: z
      .object({
        id: z.union([z.string(), z.number()]).transform((v) => String(v)),
        amount: z.number(),
        currency: z.string().min(1).default("EUR"),
        timestamp: z.coerce.date(),
        payment_type: z.string().min(1).optional(),
        products: z
          .array(
            saleLineSchema.extend({
              id: z
                .union([z.string(), z.number()])
                .transform((v) => String(v))
                .optional(),
            }),
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Forme (provisoire) d'une vente **Zettle**. Particularité : les montants Zettle
 * sont déjà en **centimes** (unité mineure). Référence produit du catalogue =
 * `products[0].productUuid` ; moyen de paiement dans `payments[0].type`.
 */
const zettleSaleSchema = z
  .object({
    purchase: z
      .object({
        purchaseUuid: z.string().min(1),
        amount: z.number().int(),
        currency: z.string().min(1).default("EUR"),
        timestamp: z.coerce.date(),
        payments: z
          .array(z.object({ type: z.string().min(1).optional() }).passthrough())
          .optional(),
        products: z
          .array(saleLineSchema.extend({ productUuid: z.string().min(1).optional() }))
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Projette une vente SumUp signée vers la forme normalisée cible. Lève une
 * `ZodError` (→ 400) si les champs requis manquent — appelée **après** la
 * vérification de signature. Montant converti d'euros vers centimes entiers.
 */
export function normalizeSumUpSale(payload: unknown): ExternalSaleInput {
  const { transaction: t } = sumUpSaleSchema.parse(payload);
  const product = t.products?.[0];
  return externalSaleSchema.parse({
    externalId: t.id,
    amountCents: Math.round(t.amount * 100),
    currency: t.currency,
    paymentMethod: t.payment_type,
    externalProductId: product?.id,
    itemLabel: product?.name,
    occurredAt: t.timestamp,
  });
}

/**
 * Projette un achat Zettle signé vers la forme normalisée cible. Lève une
 * `ZodError` (→ 400) si les champs requis manquent — appelée **après** la
 * vérification de signature. Montant déjà en centimes.
 */
export function normalizeZettleSale(payload: unknown): ExternalSaleInput {
  const { purchase: p } = zettleSaleSchema.parse(payload);
  const product = p.products?.[0];
  return externalSaleSchema.parse({
    externalId: p.purchaseUuid,
    amountCents: p.amount,
    currency: p.currency,
    paymentMethod: p.payments?.[0]?.type,
    externalProductId: product?.productUuid,
    itemLabel: product?.name,
    occurredAt: p.timestamp,
  });
}
