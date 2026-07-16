/**
 * Décision **pure** de rapprochement vente ↔ stock (mode dégradé, ADR-09 / §3.6).
 *
 * `resolveSaleReconciliation` ne lit rien et ne mute rien : à partir d'une vente
 * normalisée et de son mapping (ou `null`), elle renvoie **soit** un mouvement de
 * stock à appliquer (`SALE`, delta négatif) **soit** une anomalie à créer. **Jamais**
 * de mouvement de stock quand la vente n'est pas mappée (§Mode dégradé). ADR-03.
 */

import type { IntegrationAlertType, StockMovementReason } from "../schemas/enums.js";

/** Vente normalisée réduite aux champs nécessaires à la décision. */
export interface ReconcilableSale {
  /** Date de survenue de la vente (pour le message d'anomalie lisible). */
  occurredAt: Date;
  /** Libellé du fournisseur pour le message (« SumUp », « Zettle »…). */
  providerLabel: string;
  /**
   * Quantité vendue (multiple de la ligne de vente) ; défaut 1 unité. Doit être un
   * entier fini > 0 si fournie.
   */
  quantity?: number;
}

/** Mapping réduit à ce qui décide du rapprochement (`catalogItemId` rattaché ou non). */
export interface ReconcilableMapping {
  catalogItemId: string | null;
}

/** Mouvement de stock à appliquer (sortie `SALE`, delta **négatif**). */
export interface SaleMovementDecision {
  kind: "movement";
  catalogItemId: string;
  /** Sortie de stock : quantité vendue en **négatif**. */
  delta: number;
  reason: Extract<StockMovementReason, "SALE">;
}

/** Anomalie à créer (transaction non identifiée, aucun mouvement). */
export interface SaleAlertDecision {
  kind: "alert";
  type: Extract<IntegrationAlertType, "UNMAPPED_TRANSACTION">;
  message: string;
}

/** Résultat de la décision de rapprochement (union discriminée par `kind`). */
export type SaleReconciliation = SaleMovementDecision | SaleAlertDecision;

/** `Date` → `JJ/MM` en UTC (déterministe, pour le message d'anomalie lisible). */
function formatDayMonth(date: Date): string {
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${day}/${month}`;
}

/**
 * Décide du rapprochement d'une vente (mode dégradé, §3.6) :
 * - `mapping` présent **et** `catalogItemId` non `null` → mouvement de stock `SALE`
 *   de delta **négatif** (`−quantité`, défaut 1 unité).
 * - sinon (`mapping` `null` ou `catalogItemId` `null`) → anomalie
 *   `UNMAPPED_TRANSACTION` avec un message lisible ; **aucun** mouvement de stock.
 *
 * `RangeError` si `sale.quantity` est fourni et n'est pas un entier fini > 0.
 */
export function resolveSaleReconciliation(
  sale: ReconcilableSale,
  mapping: ReconcilableMapping | null,
): SaleReconciliation {
  const quantity = sale.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError("resolveSaleReconciliation: quantity doit être un entier > 0.");
  }

  if (mapping !== null && mapping.catalogItemId !== null) {
    return {
      kind: "movement",
      catalogItemId: mapping.catalogItemId,
      delta: -quantity,
      reason: "SALE",
    };
  }

  const message = `1 vente non identifiée sur ${sale.providerLabel} le ${formatDayMonth(
    sale.occurredAt,
  )} — ajustement manuel du stock requis`;
  return { kind: "alert", type: "UNMAPPED_TRANSACTION", message };
}
