/**
 * Accès aux données du module `transactions` (M6-08) — consultation des transactions
 * externes et **effet atomique du rapprochement** cotisation→membre. La transaction
 * externe reste **append-only** (ADR-09) : seuls `status`/`memberId` évoluent, le
 * payload brut est intact. Interface injectable pour un repository mémoire en test.
 *
 * Le rapprochement touche deux tables (`ExternalTransaction` + `Member`) en **une
 * seule transaction** → une méthode dédiée `applyReconciliation`, plutôt que de
 * disperser l'écriture entre modules.
 */

import { normalizeMatchKey } from "@brasso/core";
import type {
  ExternalTransactionKind,
  ExternalTransactionStatus,
  MembershipStatus,
  Prisma,
  PrismaClient,
} from "@brasso/db";

/** Vue DB-agnostique d'une transaction externe (payload brut **jamais** exposé). */
export interface TransactionRecord {
  id: string;
  providerId: string;
  externalId: string;
  kind: ExternalTransactionKind;
  amountCents: number;
  currency: string;
  paymentMethod: string | null;
  /** Référence produit du catalogue provider (ventes M7-03) — clé du mapping {{M7-04}}. */
  externalProductId?: string | null;
  status: ExternalTransactionStatus;
  memberId: string | null;
  occurredAt: Date;
  createdAt: Date;
}

/** Filtres + pagination de la liste des transactions. */
export interface TransactionListFilters {
  status?: ExternalTransactionStatus;
  kind?: ExternalTransactionKind;
  providerId?: string;
  limit: number;
  offset: number;
}

/** Résultat paginé d'une liste de transactions. */
export interface TransactionListResult {
  transactions: TransactionRecord[];
  total: number;
}

/** Référence minimale d'un membre pour le rapprochement (statut recalculé côté service). */
export interface ReconcileMemberRef {
  id: string;
  lastContributionAt: Date | null;
}

/** Effet transactionnel du rapprochement (valeurs déjà calculées par le service). */
export interface ReconciliationEffect {
  transactionId: string;
  memberId: string;
  lastContributionAt: Date;
  membership: MembershipStatus;
}

/** Port d'accès aux transactions (Prisma en prod, mémoire en test). */
export interface TransactionRepository {
  findById(id: string): Promise<TransactionRecord | null>;
  list(filters: TransactionListFilters): Promise<TransactionListResult>;
  /** Membre par identifiant (rapprochement manuel) — `null` si absent. */
  getMemberById(id: string): Promise<ReconcileMemberRef | null>;
  /** Membres dont l'email **normalisé** vaut `key` (auto-rapprochement). */
  findMembersByNormalizedEmail(key: string): Promise<ReconcileMemberRef[]>;
  /** Durée de validité d'une cotisation (jours) — `Settings.membershipPeriodDays`. */
  membershipPeriodDays(): Promise<number>;
  /** Applique le rapprochement en une transaction : tx (`MAPPED`) + membre. */
  applyReconciliation(effect: ReconciliationEffect): Promise<TransactionRecord>;
}

/** Colonnes exposées (jamais `rawPayload`). */
const TRANSACTION_SELECT = {
  id: true,
  providerId: true,
  externalId: true,
  kind: true,
  amountCents: true,
  currency: true,
  paymentMethod: true,
  externalProductId: true,
  status: true,
  memberId: true,
  occurredAt: true,
  createdAt: true,
} as const;

/** Adaptateur Prisma du module transactions. */
export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string): Promise<TransactionRecord | null> {
    return this.db.externalTransaction.findUnique({ where: { id }, select: TRANSACTION_SELECT });
  }

  async list(filters: TransactionListFilters): Promise<TransactionListResult> {
    const where: Prisma.ExternalTransactionWhereInput = {
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.kind !== undefined ? { kind: filters.kind } : {}),
      ...(filters.providerId !== undefined ? { providerId: filters.providerId } : {}),
    };
    const [transactions, total] = await Promise.all([
      this.db.externalTransaction.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: filters.offset,
        take: filters.limit,
        select: TRANSACTION_SELECT,
      }),
      this.db.externalTransaction.count({ where }),
    ]);
    return { transactions, total };
  }

  async getMemberById(id: string): Promise<ReconcileMemberRef | null> {
    return this.db.member.findUnique({
      where: { id },
      select: { id: true, lastContributionAt: true },
    });
  }

  async findMembersByNormalizedEmail(key: string): Promise<ReconcileMemberRef[]> {
    // La clé normalisée (NFD/casse/espaces) n'est pas calculable en SQL : on filtre
    // les membres porteurs d'un email en mémoire. Volume modeste (mono-tenant asso).
    const rows = await this.db.member.findMany({
      where: { email: { not: null } },
      select: { id: true, email: true, lastContributionAt: true },
    });
    return rows
      .filter((r) => r.email !== null && normalizeMatchKey(r.email) === key)
      .map(({ id, lastContributionAt }) => ({ id, lastContributionAt }));
  }

  async membershipPeriodDays(): Promise<number> {
    const settings = await this.db.settings.findFirst({ select: { membershipPeriodDays: true } });
    return settings?.membershipPeriodDays ?? 365;
  }

  async applyReconciliation(effect: ReconciliationEffect): Promise<TransactionRecord> {
    const [transaction] = await this.db.$transaction([
      this.db.externalTransaction.update({
        where: { id: effect.transactionId },
        data: { memberId: effect.memberId, status: "MAPPED" },
        select: TRANSACTION_SELECT,
      }),
      this.db.member.update({
        where: { id: effect.memberId },
        data: { lastContributionAt: effect.lastContributionAt, membership: effect.membership },
      }),
    ]);
    return transaction;
  }
}
