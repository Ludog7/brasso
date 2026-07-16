/**
 * Accès aux données du module `alerts` (M7-06) — dashboard des anomalies
 * d'intégration (`IntegrationAlert`, {{M1-01}}). Lecture (avec contexte
 * provider/transaction) et résolution (bascule `RESOLVED` + ajustement de stock
 * optionnel via le registre append-only M5). Pas de suppression : append-only de
 * fait (on bascule le `status`). Interface injectable pour un repository mémoire.
 */

import type { IntegrationAlertStatus, IntegrationAlertType, PrismaClient } from "@brasso/db";

/** Anomalie + contexte (provider label, transaction montant/date/produit). */
export interface AlertRecord {
  id: string;
  type: IntegrationAlertType;
  status: IntegrationAlertStatus;
  message: string;
  providerId: string | null;
  provider: { label: string } | null;
  transactionId: string | null;
  transaction: {
    amountCents: number;
    currency: string;
    occurredAt: Date;
    externalProductId: string | null;
  } | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface AlertListFilters {
  status?: IntegrationAlertStatus;
  type?: IntegrationAlertType;
  limit: number;
  offset: number;
}

/** Ajustement de stock manuel accompagnant une résolution (mouvement `ADJUSTMENT`). */
export interface StockAdjustment {
  catalogItemId: string;
  delta: number;
  note?: string;
}

/** Port d'accès aux anomalies (Prisma en prod, mémoire en test). */
export interface AlertRepository {
  list(filters: AlertListFilters): Promise<{ alerts: AlertRecord[]; total: number }>;
  findById(id: string): Promise<AlertRecord | null>;
  /**
   * Bascule l'anomalie `RESOLVED` (`resolvedAt = now`) et, si `adjustment` fourni,
   * crée **un** `StockMovement` `ADJUSTMENT` (registre M5, tracé `userId`). Transactionnel.
   */
  resolve(
    id: string,
    adjustment: StockAdjustment | null,
    userId: string | null,
  ): Promise<AlertRecord>;
  /** Crée une anomalie `WEBHOOK_FAILURE` **ouverte** (échec d'ingestion post-signature). */
  createWebhookFailure(providerId: string, message: string): Promise<{ id: string }>;
}

/** Colonnes exposées (jointures légères : label fournisseur + contexte transaction). */
const ALERT_SELECT = {
  id: true,
  type: true,
  status: true,
  message: true,
  providerId: true,
  provider: { select: { label: true } },
  transactionId: true,
  transaction: {
    select: { amountCents: true, currency: true, occurredAt: true, externalProductId: true },
  },
  createdAt: true,
  resolvedAt: true,
} as const;

/** Adaptateur Prisma du module alerts. */
export class PrismaAlertRepository implements AlertRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(filters: AlertListFilters): Promise<{ alerts: AlertRecord[]; total: number }> {
    const where = {
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.type !== undefined ? { type: filters.type } : {}),
    };
    const [alerts, total] = await Promise.all([
      this.db.integrationAlert.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: filters.offset,
        take: filters.limit,
        select: ALERT_SELECT,
      }),
      this.db.integrationAlert.count({ where }),
    ]);
    return { alerts, total };
  }

  findById(id: string): Promise<AlertRecord | null> {
    return this.db.integrationAlert.findUnique({ where: { id }, select: ALERT_SELECT });
  }

  resolve(
    id: string,
    adjustment: StockAdjustment | null,
    userId: string | null,
  ): Promise<AlertRecord> {
    // Ajustement (facultatif) + bascule RESOLVED dans la MÊME transaction : le
    // mouvement de correction et le changement d'état sont atomiques.
    return this.db.$transaction(async (tx) => {
      if (adjustment) {
        await tx.stockMovement.create({
          data: {
            catalogItemId: adjustment.catalogItemId,
            delta: adjustment.delta,
            reason: "ADJUSTMENT",
            note: adjustment.note ?? null,
            userId,
          },
        });
      }
      return tx.integrationAlert.update({
        where: { id },
        data: { status: "RESOLVED", resolvedAt: new Date() },
        select: ALERT_SELECT,
      });
    });
  }

  async createWebhookFailure(providerId: string, message: string): Promise<{ id: string }> {
    const alert = await this.db.integrationAlert.create({
      data: { type: "WEBHOOK_FAILURE", status: "OPEN", message, providerId },
      select: { id: true },
    });
    return { id: alert.id };
  }
}
