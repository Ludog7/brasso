/**
 * Schémas Zod du module `transactions` (M6-08) : query de la liste « à rapprocher »
 * et corps du rapprochement manuel. Les enums reprennent les valeurs Prisma
 * (`ExternalTransactionStatus`/`Kind`).
 */

import { z } from "zod";

export const transactionStatusSchema = z.enum(["MAPPED", "UNMAPPED", "IGNORED"]);
export const transactionKindSchema = z.enum(["SALE", "MEMBERSHIP", "DONATION", "OTHER"]);

/** Filtres + pagination de `GET /transactions` (ex. `?status=UNMAPPED&kind=SALE&providerId=…`). */
export const transactionListQuery = z.object({
  status: transactionStatusSchema.optional(),
  kind: transactionKindSchema.optional(),
  providerId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TransactionListQuery = z.infer<typeof transactionListQuery>;

/** Corps de `POST /transactions/:id/reconcile` : le membre à rapprocher. */
export const reconcileBody = z.object({ memberId: z.string().min(1) });
export type ReconcileBody = z.infer<typeof reconcileBody>;
