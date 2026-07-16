/**
 * Accès aux données du module `exports` (M7-07) — lecture **read-only** (ADR-09)
 * des ventes, cotisations et mouvements de stock sur une période, pour l'export
 * CSV comptable. Tri stable ascendant (déterministe). Interface injectable pour un
 * repository mémoire en test.
 */

import type { PrismaClient, StockMovementReason } from "@brasso/db";

/** Bornes de période (incluses). */
export interface DateRange {
  from: Date;
  to: Date;
}

/** Vente à exporter (issue d'`ExternalTransaction` `kind = SALE`). */
export interface SaleExportRecord {
  occurredAt: Date;
  amountCents: number;
  currency: string;
  paymentMethod: string | null;
  externalProductId: string | null;
  externalId: string;
}

/** Cotisation à exporter (issue d'`ExternalTransaction` `kind = MEMBERSHIP`). */
export interface ContributionExportRecord {
  occurredAt: Date;
  amountCents: number;
  currency: string;
  externalId: string;
  /** Libellé du membre rapproché (`Prénom Nom`) ou `null` si non rapprochée. */
  memberLabel: string | null;
}

/** Mouvement de stock à exporter (issu du registre `StockMovement`). */
export interface MovementExportRecord {
  occurredAt: Date;
  articleLabel: string;
  delta: number;
  reason: StockMovementReason;
  note: string | null;
}

/** Port d'accès aux exports (Prisma en prod, mémoire en test). */
export interface ExportRepository {
  listSales(range: DateRange): Promise<SaleExportRecord[]>;
  listContributions(range: DateRange): Promise<ContributionExportRecord[]>;
  listMovements(range: DateRange): Promise<MovementExportRecord[]>;
}

/** Adaptateur Prisma du module exports. */
export class PrismaExportRepository implements ExportRepository {
  constructor(private readonly db: PrismaClient) {}

  async listSales(range: DateRange): Promise<SaleExportRecord[]> {
    return this.db.externalTransaction.findMany({
      where: { kind: "SALE", occurredAt: { gte: range.from, lte: range.to } },
      orderBy: { occurredAt: "asc" },
      select: {
        occurredAt: true,
        amountCents: true,
        currency: true,
        paymentMethod: true,
        externalProductId: true,
        externalId: true,
      },
    });
  }

  async listContributions(range: DateRange): Promise<ContributionExportRecord[]> {
    // `ExternalTransaction.memberId` est un scalaire (pas de relation Prisma) : on
    // résout les libellés membres en un second lookup groupé (pas de N+1).
    const rows = await this.db.externalTransaction.findMany({
      where: { kind: "MEMBERSHIP", occurredAt: { gte: range.from, lte: range.to } },
      orderBy: { occurredAt: "asc" },
      select: {
        occurredAt: true,
        amountCents: true,
        currency: true,
        externalId: true,
        memberId: true,
      },
    });
    const memberIds = [
      ...new Set(rows.map((r) => r.memberId).filter((id): id is string => id !== null)),
    ];
    const members = await this.db.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const labelById = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
    return rows.map((r) => ({
      occurredAt: r.occurredAt,
      amountCents: r.amountCents,
      currency: r.currency,
      externalId: r.externalId,
      memberLabel: r.memberId ? (labelById.get(r.memberId) ?? null) : null,
    }));
  }

  async listMovements(range: DateRange): Promise<MovementExportRecord[]> {
    const rows = await this.db.stockMovement.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        delta: true,
        reason: true,
        note: true,
        catalogItem: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      occurredAt: r.createdAt,
      articleLabel: r.catalogItem.name,
      delta: r.delta,
      reason: r.reason,
      note: r.note,
    }));
  }
}
