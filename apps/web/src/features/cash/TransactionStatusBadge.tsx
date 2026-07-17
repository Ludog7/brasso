/**
 * Badge de statut de rapprochement d'une transaction externe (M7-09) : `MAPPED` =
 * vert, `UNMAPPED` = ambre, `IGNORED` = gris. Le statut est porté par l'API (ADR-09,
 * la transaction est append-only).
 */

import type { ExternalTransactionStatus } from "@/lib/api";
import { Badge } from "@/ui/badge";

import { TRANSACTION_STATUS_LABELS, TRANSACTION_STATUS_TONE } from "./labels";

export function TransactionStatusBadge({ status }: { status: ExternalTransactionStatus }) {
  return <Badge tone={TRANSACTION_STATUS_TONE[status]}>{TRANSACTION_STATUS_LABELS[status]}</Badge>;
}
