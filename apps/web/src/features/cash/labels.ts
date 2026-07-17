/**
 * Libellés FR de l'espace caisse (M7-09) : statut de rapprochement et nature des
 * transactions externes. Ordres d'itération stables pour un rendu déterministe.
 */

import type { ExternalTransactionKind, ExternalTransactionStatus } from "@/lib/api";
import type { BadgeProps } from "@/ui/badge";

export const TRANSACTION_STATUS_LABELS: Record<ExternalTransactionStatus, string> = {
  MAPPED: "Rapprochée",
  UNMAPPED: "À rapprocher",
  IGNORED: "Ignorée",
};

/** Teinte du badge par statut : rapprochée = vert, à rapprocher = ambre, ignorée = gris. */
export const TRANSACTION_STATUS_TONE: Record<ExternalTransactionStatus, BadgeProps["tone"]> = {
  MAPPED: "success",
  UNMAPPED: "warning",
  IGNORED: "muted",
};

export const TRANSACTION_KINDS: ExternalTransactionKind[] = [
  "SALE",
  "MEMBERSHIP",
  "DONATION",
  "OTHER",
];

export const TRANSACTION_KIND_LABELS: Record<ExternalTransactionKind, string> = {
  SALE: "Vente",
  MEMBERSHIP: "Cotisation",
  DONATION: "Don",
  OTHER: "Autre",
};
