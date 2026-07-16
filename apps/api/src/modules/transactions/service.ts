/**
 * Orchestration du module `transactions` (M6-08) — **cœur de la démo M6** : une
 * cotisation ingérée ({{M6-07}}) est rapprochée d'un membre (auto par email
 * normalisé, ou manuel en repli), ce qui pose `lastContributionAt` et fait passer
 * le membre **`A_JOUR`** (statut dérivé, core). Effet transactionnel + audité.
 */

import { deriveMembershipStatus, normalizeMatchKey } from "@brasso/core";
import type {
  ExternalTransactionKind,
  ExternalTransactionStatus,
  MembershipStatus,
} from "@brasso/db";

import type { AuditService } from "../audit/service.js";
import type {
  ReconcileMemberRef,
  TransactionListFilters,
  TransactionRecord,
  TransactionRepository,
} from "./repository.js";

/** Transaction introuvable → 404. */
export class TransactionNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "TRANSACTION_NOT_FOUND";
  constructor(id: string) {
    super(`Transaction ${id} introuvable`);
    this.name = "TransactionNotFoundError";
  }
}

/** Membre cible du rapprochement introuvable → 404. */
export class ReconcileMemberNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "MEMBER_NOT_FOUND";
  constructor(id: string) {
    super(`Membre ${id} introuvable`);
    this.name = "ReconcileMemberNotFoundError";
  }
}

/** Transaction déjà rapprochée à un **autre** membre → 409 (ré-assignation refusée). */
export class TransactionAlreadyReconciledError extends Error {
  readonly statusCode = 409;
  readonly code = "TRANSACTION_ALREADY_RECONCILED";
  constructor(id: string, memberId: string) {
    super(`Transaction ${id} déjà rapprochée au membre ${memberId}`);
    this.name = "TransactionAlreadyReconciledError";
  }
}

/** Acteur d'une action (session + IP) pour la traçabilité d'audit. */
export interface Actor {
  userId: string | null;
  ip: string | null;
}

/** Acteur système : auto-rapprochement déclenché par le webhook (pas de session). */
const SYSTEM_ACTOR: Actor = { userId: null, ip: null };

/** Vue sérialisée d'une transaction (dates ISO ; jamais de payload brut). */
export interface TransactionView {
  id: string;
  providerId: string;
  externalId: string;
  kind: ExternalTransactionKind;
  amountCents: number;
  currency: string;
  paymentMethod: string | null;
  /** Référence produit du catalogue provider (ventes M7-03) — clé du mapping {{M7-04}}. */
  externalProductId: string | null;
  status: ExternalTransactionStatus;
  memberId: string | null;
  /**
   * Indicateur de **présence** du payload brut (jamais son contenu). Toujours vrai
   * par l'invariant ADR-09 (append-only : chaque transaction conserve son payload) —
   * signale au client qu'un original existe côté serveur sans l'exposer.
   */
  hasRawPayload: boolean;
  occurredAt: string;
  createdAt: string;
}

export class TransactionService {
  constructor(
    private readonly repo: TransactionRepository,
    private readonly audit: AuditService,
  ) {}

  /** Liste paginée des transactions (filtres status/kind/providerId), `occurredAt` desc. */
  async list(
    filters: TransactionListFilters,
  ): Promise<{ transactions: TransactionView[]; total: number }> {
    const { transactions, total } = await this.repo.list(filters);
    return { transactions: transactions.map(toView), total };
  }

  /** Détail normalisé d'une transaction (sans payload brut) — 404 si absente. */
  async get(id: string): Promise<TransactionView> {
    const tx = await this.repo.findById(id);
    if (!tx) {
      throw new TransactionNotFoundError(id);
    }
    return toView(tx);
  }

  /**
   * Rapprochement **manuel** (repli quand l'auto échoue). Idempotent au même membre ;
   * 409 si déjà rapprochée à un autre membre ; 404 transaction/membre absents.
   */
  async reconcileManual(
    transactionId: string,
    memberId: string,
    actor: Actor,
  ): Promise<TransactionView> {
    const tx = await this.repo.findById(transactionId);
    if (!tx) {
      throw new TransactionNotFoundError(transactionId);
    }
    if (tx.status === "MAPPED" && tx.memberId === memberId) {
      return toView(tx); // no-op : déjà rapprochée à ce membre.
    }
    if (tx.status === "MAPPED" && tx.memberId !== null && tx.memberId !== memberId) {
      throw new TransactionAlreadyReconciledError(transactionId, tx.memberId);
    }
    const member = await this.repo.getMemberById(memberId);
    if (!member) {
      throw new ReconcileMemberNotFoundError(memberId);
    }
    const updated = await this.applyReconciliation(tx, member, actor, false);
    return toView(updated);
  }

  /**
   * Auto-rapprochement à l'ingestion (post-traitement du webhook). Match **unique**
   * par email normalisé → rapproche ; zéro/plusieurs matchs → laisse `UNMAPPED`.
   * **Ne lève jamais** : le rapprochement ne doit pas casser l'ingestion.
   */
  async autoReconcile(
    transactionId: string,
    payerEmail: string | null,
  ): Promise<{ matched: boolean }> {
    if (!payerEmail) {
      return { matched: false };
    }
    const key = normalizeMatchKey(payerEmail);
    if (key === "") {
      return { matched: false };
    }
    const members = await this.repo.findMembersByNormalizedEmail(key);
    if (members.length !== 1) {
      return { matched: false }; // inconnu ou ambigu → à rapprocher manuellement.
    }
    const tx = await this.repo.findById(transactionId);
    if (!tx || tx.status === "MAPPED") {
      return { matched: false };
    }
    await this.applyReconciliation(tx, members[0]!, SYSTEM_ACTOR, true);
    return { matched: true };
  }

  /**
   * Effet commun (auto + manuel) : pose `memberId`/`MAPPED` sur la transaction,
   * `lastContributionAt = max(existante, occurredAt)` (ne régresse jamais) et le
   * cache `membership` dérivé. Transactionnel puis audité `CONTRIBUTION_RECONCILE`.
   */
  private async applyReconciliation(
    tx: TransactionRecord,
    member: ReconcileMemberRef,
    actor: Actor,
    auto: boolean,
  ): Promise<TransactionRecord> {
    const lastContributionAt =
      member.lastContributionAt !== null &&
      member.lastContributionAt.getTime() >= tx.occurredAt.getTime()
        ? member.lastContributionAt
        : tx.occurredAt;
    const periodDays = await this.repo.membershipPeriodDays();
    const membership: MembershipStatus = deriveMembershipStatus(
      lastContributionAt,
      periodDays,
      new Date(),
    );
    const updated = await this.repo.applyReconciliation({
      transactionId: tx.id,
      memberId: member.id,
      lastContributionAt,
      membership,
    });
    await this.audit.record({
      userId: actor.userId,
      action: "CONTRIBUTION_RECONCILE",
      resourceType: "transaction",
      resourceId: tx.id,
      memberId: member.id,
      ip: actor.ip,
      metadata: {
        amountCents: tx.amountCents,
        currency: tx.currency,
        reference: tx.externalId,
        auto,
      },
    });
    return updated;
  }
}

/** Sérialise une transaction en vue API : dates ISO, sans payload brut. */
function toView(record: TransactionRecord): TransactionView {
  return {
    id: record.id,
    providerId: record.providerId,
    externalId: record.externalId,
    kind: record.kind,
    amountCents: record.amountCents,
    currency: record.currency,
    paymentMethod: record.paymentMethod,
    externalProductId: record.externalProductId ?? null,
    status: record.status,
    memberId: record.memberId,
    hasRawPayload: true,
    occurredAt: record.occurredAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}
