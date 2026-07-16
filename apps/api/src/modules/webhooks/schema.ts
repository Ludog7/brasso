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
