/**
 * Accès aux données du rapprochement **vente → stock** (M7-05, cœur démo M7). Lit
 * la transaction `SALE` et son mapping, écrit un `StockMovement` `SALE` (registre
 * append-only M5, lié à la transaction) **ou** une `IntegrationAlert` (mode dégradé,
 * ADR-09). La transaction externe n'évolue qu'en `status` (append-only : payload
 * brut intact). Interface injectable pour un repository mémoire en test.
 */

import type { ExternalTransactionKind, ExternalTransactionStatus, PrismaClient } from "@brasso/db";

/** Transaction de vente + libellé fournisseur (message d'anomalie lisible). */
export interface SaleTransactionRecord {
  id: string;
  providerId: string;
  providerLabel: string;
  externalProductId: string | null;
  kind: ExternalTransactionKind;
  status: ExternalTransactionStatus;
  occurredAt: Date;
}

/** Port d'accès au rapprochement (Prisma en prod, mémoire en test). */
export interface ReconciliationRepository {
  /** Transaction (avec libellé fournisseur) — `null` si absente. */
  getSaleTransaction(id: string): Promise<SaleTransactionRecord | null>;
  /** Mapping pour ce couple ; `catalogItemId` peut être `null` (mapping incomplet). */
  findMapping(
    providerId: string,
    externalProductId: string,
  ): Promise<{ catalogItemId: string | null } | null>;
  /** Un mouvement de vente est-il déjà lié à cette transaction ? (idempotence dure). */
  hasSaleMovement(transactionId: string): Promise<boolean>;
  /** Anomalie `UNMAPPED_TRANSACTION` **ouverte** de cette transaction — `null` sinon. */
  findOpenUnmappedAlert(transactionId: string): Promise<{ id: string } | null>;
  /** Mouvement `SALE` (delta<0, lié) + passage `MAPPED` de la transaction. Transactionnel. */
  applySaleMovement(input: {
    transactionId: string;
    catalogItemId: string;
    delta: number;
  }): Promise<{ movementId: string }>;
  /** Crée une anomalie `UNMAPPED_TRANSACTION` **ouverte** (mode dégradé). */
  createUnmappedAlert(input: {
    providerId: string;
    transactionId: string;
    message: string;
  }): Promise<{ id: string }>;
  /** Résout (RESOLVED) les anomalies `UNMAPPED_TRANSACTION` ouvertes de cette transaction. */
  resolveUnmappedAlerts(transactionId: string): Promise<number>;
}

/** Adaptateur Prisma du rapprochement vente→stock. */
export class PrismaReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly db: PrismaClient) {}

  async getSaleTransaction(id: string): Promise<SaleTransactionRecord | null> {
    const tx = await this.db.externalTransaction.findUnique({
      where: { id },
      select: {
        id: true,
        providerId: true,
        externalProductId: true,
        kind: true,
        status: true,
        occurredAt: true,
        provider: { select: { label: true } },
      },
    });
    if (!tx) {
      return null;
    }
    return {
      id: tx.id,
      providerId: tx.providerId,
      providerLabel: tx.provider.label,
      externalProductId: tx.externalProductId,
      kind: tx.kind,
      status: tx.status,
      occurredAt: tx.occurredAt,
    };
  }

  async findMapping(
    providerId: string,
    externalProductId: string,
  ): Promise<{ catalogItemId: string | null } | null> {
    return this.db.skuMapping.findFirst({
      where: { providerId, externalProductId },
      select: { catalogItemId: true },
    });
  }

  async hasSaleMovement(transactionId: string): Promise<boolean> {
    const count = await this.db.stockMovement.count({
      where: { externalTransactionId: transactionId, reason: "SALE" },
    });
    return count > 0;
  }

  async findOpenUnmappedAlert(transactionId: string): Promise<{ id: string } | null> {
    return this.db.integrationAlert.findFirst({
      where: { transactionId, type: "UNMAPPED_TRANSACTION", status: "OPEN" },
      select: { id: true },
    });
  }

  async applySaleMovement(input: {
    transactionId: string;
    catalogItemId: string;
    delta: number;
  }): Promise<{ movementId: string }> {
    // Mouvement de vente (origine système, lié à la transaction) + statut MAPPED
    // dans la MÊME transaction : le décrément et le changement d'état sont atomiques.
    const [movement] = await this.db.$transaction([
      this.db.stockMovement.create({
        data: {
          catalogItemId: input.catalogItemId,
          delta: input.delta,
          reason: "SALE",
          externalTransactionId: input.transactionId,
          userId: null,
        },
        select: { id: true },
      }),
      this.db.externalTransaction.update({
        where: { id: input.transactionId },
        data: { status: "MAPPED" },
      }),
    ]);
    return { movementId: movement.id };
  }

  async createUnmappedAlert(input: {
    providerId: string;
    transactionId: string;
    message: string;
  }): Promise<{ id: string }> {
    const alert = await this.db.integrationAlert.create({
      data: {
        type: "UNMAPPED_TRANSACTION",
        status: "OPEN",
        message: input.message,
        providerId: input.providerId,
        transactionId: input.transactionId,
      },
      select: { id: true },
    });
    return { id: alert.id };
  }

  async resolveUnmappedAlerts(transactionId: string): Promise<number> {
    const { count } = await this.db.integrationAlert.updateMany({
      where: { transactionId, type: "UNMAPPED_TRANSACTION", status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    return count;
  }
}
