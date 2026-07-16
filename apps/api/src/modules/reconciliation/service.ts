/**
 * Rapprochement **vente → stock** (M7-05, cœur démo M7). Décision **pure** déléguée
 * à `resolveSaleReconciliation` ({{M7-01}}) : une vente mappée décrémente le stock
 * (mouvement `SALE` lié, transaction `MAPPED`) ; une vente non mappée reste
 * enregistrée et génère une anomalie (`UNMAPPED_TRANSACTION`), **sans** toucher au
 * stock (mode dégradé ADR-09). Idempotent : au plus un mouvement et une anomalie
 * ouverte par transaction.
 */

import { resolveSaleReconciliation } from "@brasso/core";

import { TransactionNotFoundError } from "../transactions/service.js";
import type { ReconciliationRepository, SaleTransactionRecord } from "./repository.js";

/** Issue d'un rapprochement (observabilité + réponse du re-traitement manuel). */
export interface ReconcileResult {
  status: "mapped" | "unmapped" | "already_mapped" | "skipped";
  movementId?: string;
  alertId?: string;
}

export class ReconciliationService {
  constructor(private readonly repo: ReconciliationRepository) {}

  /**
   * Rapprochement **post-ingestion** (branché sur le webhook, {{M7-03}}). Best-effort :
   * l'appelant (route) journalise et **n'échoue jamais** l'ingestion sur une erreur ici.
   * Transaction absente ou non-`SALE` → no-op silencieux (`skipped`).
   */
  async reconcileSale(transactionId: string): Promise<ReconcileResult> {
    const tx = await this.repo.getSaleTransaction(transactionId);
    if (!tx || tx.kind !== "SALE") {
      return { status: "skipped" };
    }
    return this.apply(tx);
  }

  /**
   * Re-traitement **manuel** d'une transaction (après création d'un mapping) :
   * 404 si absente, no-op si déjà `MAPPED`. Sur mapping réussi → mouvement +
   * résolution de l'anomalie liée.
   */
  async reprocess(transactionId: string): Promise<ReconcileResult> {
    const tx = await this.repo.getSaleTransaction(transactionId);
    if (!tx) {
      throw new TransactionNotFoundError(transactionId);
    }
    return this.apply(tx);
  }

  /**
   * Cœur commun : applique la décision pure au registre. Gardes d'idempotence en
   * amont (déjà `MAPPED` ou mouvement de vente déjà présent → no-op).
   */
  private async apply(tx: SaleTransactionRecord): Promise<ReconcileResult> {
    if (tx.status === "MAPPED" || (await this.repo.hasSaleMovement(tx.id))) {
      return { status: "already_mapped" };
    }

    const mapping = tx.externalProductId
      ? await this.repo.findMapping(tx.providerId, tx.externalProductId)
      : null;

    const decision = resolveSaleReconciliation(
      { occurredAt: tx.occurredAt, providerLabel: tx.providerLabel },
      mapping ? { catalogItemId: mapping.catalogItemId } : null,
    );

    if (decision.kind === "movement") {
      const { movementId } = await this.repo.applySaleMovement({
        transactionId: tx.id,
        catalogItemId: decision.catalogItemId,
        delta: decision.delta,
      });
      // Un re-traitement réussi rend caduque toute anomalie ouverte de cette vente.
      await this.repo.resolveUnmappedAlerts(tx.id);
      return { status: "mapped", movementId };
    }

    // Mode dégradé : au plus une anomalie ouverte par transaction (idempotent).
    const existing = await this.repo.findOpenUnmappedAlert(tx.id);
    if (existing) {
      return { status: "unmapped", alertId: existing.id };
    }
    const alert = await this.repo.createUnmappedAlert({
      providerId: tx.providerId,
      transactionId: tx.id,
      message: decision.message,
    });
    return { status: "unmapped", alertId: alert.id };
  }
}
