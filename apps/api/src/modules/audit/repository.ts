/**
 * Accès au **journal d'audit** (M6-03) — `AuditLog` append-only (§3.4), verrouillé
 * par trigger contre UPDATE/DELETE. Écriture (`record`) et lecture paginée/filtrée
 * (`list`). Interface injectable pour un repository en mémoire dans les tests.
 *
 * `memberId` est un scalaire **sans FK** (schéma M1-01) : la piste d'audit survit
 * à l'anonymisation d'un membre (M6-06).
 */

import type { Prisma, PrismaClient } from "@brasso/db";

/** Entrée d'audit à insérer (append-only). */
export interface AuditInsert {
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  memberId?: string | null;
  ip?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Vue DB-agnostique d'une entrée d'audit. */
export interface AuditEntryRecord {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  memberId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: Date;
}

/** Filtres de consultation du journal (tous optionnels sauf pagination). */
export interface AuditListFilters {
  memberId?: string;
  resourceType?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

/** Résultat paginé d'une consultation. */
export interface AuditListResult {
  entries: AuditEntryRecord[];
  total: number;
}

/** Port d'accès au journal d'audit (Prisma en prod, mémoire en test). */
export interface AuditRepository {
  /** Insère une entrée (append-only) et la renvoie. */
  record(entry: AuditInsert): Promise<AuditEntryRecord>;
  /** Liste les entrées, `createdAt` desc, filtrées et paginées. */
  list(filters: AuditListFilters): Promise<AuditListResult>;
}

/** Adaptateur Prisma du journal d'audit. */
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly db: PrismaClient) {}

  async record(entry: AuditInsert): Promise<AuditEntryRecord> {
    const row = await this.db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        memberId: entry.memberId ?? null,
        ip: entry.ip ?? null,
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
      },
    });
    return toEntry(row);
  }

  async list(filters: AuditListFilters): Promise<AuditListResult> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.memberId !== undefined ? { memberId: filters.memberId } : {}),
      ...(filters.resourceType !== undefined ? { resourceType: filters.resourceType } : {}),
      ...(filters.action !== undefined ? { action: filters.action } : {}),
      ...(filters.from !== undefined || filters.to !== undefined
        ? {
            createdAt: {
              ...(filters.from !== undefined ? { gte: filters.from } : {}),
              ...(filters.to !== undefined ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: filters.offset,
        take: filters.limit,
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { entries: rows.map(toEntry), total };
  }
}

/** Mappe une ligne Prisma `AuditLog` vers la vue DB-agnostique. */
function toEntry(row: {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  memberId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: Date;
}): AuditEntryRecord {
  return {
    id: row.id,
    userId: row.userId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    memberId: row.memberId,
    ip: row.ip,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}
