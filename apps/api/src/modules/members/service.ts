/**
 * Orchestration du module `members` (M6-04) : CRUD identité + rôles, **statut de
 * cotisation dérivé** à la lecture (core `deriveMembershipStatus`) et **audit** de
 * tout accès/écriture de donnée personnelle (§6, helper `AuditService.record`).
 * La suppression n'est pas exposée (droit à l'effacement = anonymisation, M6-06).
 */

import {
  anonymizeMember,
  buildMemberExport,
  CONSENT_TYPES,
  deriveMembershipStatus,
  type MemberExport,
  resolveConsents,
} from "@brasso/core";
import type { AssociativeRole, ConsentType, MembershipStatus } from "@brasso/db";

import type { AuditService } from "../audit/service.js";
import type {
  ConsentEventRecord,
  MemberListFilters,
  MemberRecord,
  MemberRepository,
} from "./repository.js";
import type { ConsentInput, MemberCreateInput, MemberUpdateInput } from "./schema.js";

/** Membre introuvable → 404. */
export class MemberNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "MEMBER_NOT_FOUND";
  constructor(id: string) {
    super(`Membre ${id} introuvable`);
    this.name = "MemberNotFoundError";
  }
}

/** Numéro d'adhérent déjà pris (unique) → 409. */
export class MemberNumberTakenError extends Error {
  readonly statusCode = 409;
  readonly code = "MEMBER_NUMBER_TAKEN";
  constructor(memberNumber: string) {
    super(`Le numéro d'adhérent ${memberNumber} est déjà utilisé`);
    this.name = "MemberNumberTakenError";
  }
}

/** Anonymisation déjà effectuée (irréversible) → 409. */
export class MemberAlreadyAnonymizedError extends Error {
  readonly statusCode = 409;
  readonly code = "MEMBER_ALREADY_ANONYMIZED";
  constructor(id: string) {
    super(`Le membre ${id} a déjà été anonymisé (opération irréversible)`);
    this.name = "MemberAlreadyAnonymizedError";
  }
}

/** Vue sérialisée d'un membre (dates ISO, statut **dérivé**). */
export interface MemberView {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  birthDate: string | null;
  membership: MembershipStatus;
  roles: AssociativeRole[];
  lastContributionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Acteur d'une action (session + IP) pour la traçabilité d'audit. */
export interface Actor {
  userId: string | null;
  ip: string | null;
}

/** Un événement de consentement sérialisé (date ISO). */
export interface ConsentEventView {
  id: string;
  type: ConsentType;
  granted: boolean;
  createdAt: string;
}

/** État des consentements d'un membre : courant résolu (par type) + historique. */
export interface ConsentsView {
  current: Record<ConsentType, { granted: boolean; at: string } | null>;
  history: ConsentEventView[];
}

export class MemberService {
  constructor(
    private readonly repo: MemberRepository,
    private readonly audit: AuditService,
  ) {}

  /** Liste paginée : statut dérivé par membre (une seule lecture de la période). */
  async list(filters: MemberListFilters): Promise<{ members: MemberView[]; total: number }> {
    const [{ members, total }, periodDays] = await Promise.all([
      this.repo.list(filters),
      this.repo.membershipPeriodDays(),
    ]);
    const now = new Date();
    return { members: members.map((m) => toView(m, periodDays, now)), total };
  }

  /** Détail d'un membre — **audite** l'accès à une donnée personnelle (§6). */
  async get(id: string, actor: Actor): Promise<MemberView> {
    const record = await this.requireMember(id);
    const periodDays = await this.repo.membershipPeriodDays();
    await this.audit.record({
      userId: actor.userId,
      action: "MEMBER_READ",
      resourceType: "member",
      resourceId: id,
      memberId: id,
      ip: actor.ip,
    });
    return toView(record, periodDays, new Date());
  }

  /** Crée un membre (numéro unique) et trace `MEMBER_CREATE`. */
  async create(data: MemberCreateInput, actor: Actor): Promise<MemberView> {
    const clash = await this.repo.findByMemberNumber(data.memberNumber);
    if (clash) {
      throw new MemberNumberTakenError(data.memberNumber);
    }
    const record = await this.repo.create(data);
    const periodDays = await this.repo.membershipPeriodDays();
    await this.audit.record({
      userId: actor.userId,
      action: "MEMBER_CREATE",
      resourceType: "member",
      resourceId: record.id,
      memberId: record.id,
      ip: actor.ip,
    });
    return toView(record, periodDays, new Date());
  }

  /** Rectifie l'identité d'un membre et trace `MEMBER_UPDATE` (champs modifiés). */
  async update(id: string, patch: MemberUpdateInput, actor: Actor): Promise<MemberView> {
    await this.requireMember(id);
    const record = await this.repo.update(id, patch);
    const periodDays = await this.repo.membershipPeriodDays();
    await this.audit.record({
      userId: actor.userId,
      action: "MEMBER_UPDATE",
      resourceType: "member",
      resourceId: id,
      memberId: id,
      ip: actor.ip,
      metadata: { fields: Object.keys(patch) },
    });
    return toView(record, periodDays, new Date());
  }

  /** État des consentements (courant résolu + historique) — audite l'accès. */
  async getConsents(id: string, actor: Actor): Promise<ConsentsView> {
    await this.requireMember(id);
    const events = await this.repo.listConsents(id);
    await this.audit.record({
      userId: actor.userId,
      action: "CONSENT_READ",
      resourceType: "member",
      resourceId: id,
      memberId: id,
      ip: actor.ip,
    });
    return toConsentsView(events);
  }

  /** Ajoute un événement de consentement (append-only) et trace `CONSENT_CHANGE`. */
  async addConsent(id: string, input: ConsentInput, actor: Actor): Promise<ConsentEventView> {
    await this.requireMember(id);
    const event = await this.repo.addConsent(id, input);
    await this.audit.record({
      userId: actor.userId,
      action: "CONSENT_CHANGE",
      resourceType: "member",
      resourceId: id,
      memberId: id,
      ip: actor.ip,
      metadata: { type: input.type, granted: input.granted },
    });
    return toConsentEventView(event);
  }

  /**
   * Assemble le **dossier RGPD** portable (droit d'accès) : identité, consentements,
   * cotisations rapprochées, piste d'audit. Trace `MEMBER_EXPORT`. RBAC `export`.
   */
  async exportDossier(id: string, actor: Actor): Promise<MemberExport> {
    const record = await this.requireMember(id);
    const [periodDays, consents, contributions, audit] = await Promise.all([
      this.repo.membershipPeriodDays(),
      this.repo.listConsents(id),
      this.repo.listContributions(id),
      this.audit.list({ memberId: id, limit: 500, offset: 0 }),
    ]);
    const dossier = buildMemberExport({
      member: {
        memberNumber: record.memberNumber,
        firstName: record.firstName,
        lastName: record.lastName,
        email: record.email,
        phone: record.phone,
        address: record.address,
        birthDate: record.birthDate,
        membership: deriveMembershipStatus(record.lastContributionAt, periodDays, new Date()),
      },
      consents: consents.map((e) => ({ type: e.type, granted: e.granted, at: e.createdAt })),
      contributions,
      auditTrail: audit.entries.map((a) => ({
        action: a.action,
        at: a.createdAt,
        resourceType: a.resourceType,
      })),
    });
    await this.audit.record({
      userId: actor.userId,
      action: "MEMBER_EXPORT",
      resourceType: "member",
      resourceId: id,
      memberId: id,
      ip: actor.ip,
    });
    return dossier;
  }

  /**
   * **Anonymise** un membre (pseudonymisation §3.4, irréversible). Efface la PII,
   * délie le compte `User`, conserve `memberNumber`/agrégats/audit. Trace
   * `MEMBER_ANONYMIZE` (le marqueur d'idempotence). RBAC `anonymize`.
   */
  async anonymize(id: string, actor: Actor): Promise<MemberView> {
    await this.requireMember(id);
    // Idempotence sans champ dédié : une trace MEMBER_ANONYMIZE ⇒ déjà anonymisé.
    const prior = await this.audit.list({
      memberId: id,
      action: "MEMBER_ANONYMIZE",
      limit: 1,
      offset: 0,
    });
    if (prior.total > 0) {
      throw new MemberAlreadyAnonymizedError(id);
    }
    const record = await this.repo.anonymize(id, anonymizeMember());
    const periodDays = await this.repo.membershipPeriodDays();
    await this.audit.record({
      userId: actor.userId,
      action: "MEMBER_ANONYMIZE",
      resourceType: "member",
      resourceId: id,
      memberId: id,
      ip: actor.ip,
    });
    return toView(record, periodDays, new Date());
  }

  private async requireMember(id: string): Promise<MemberRecord> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw new MemberNotFoundError(id);
    }
    return record;
  }
}

function toConsentEventView(event: ConsentEventRecord): ConsentEventView {
  return {
    id: event.id,
    type: event.type,
    granted: event.granted,
    createdAt: event.createdAt.toISOString(),
  };
}

/** Résout le consentement courant par type (core) + sérialise l'historique. */
function toConsentsView(events: ConsentEventRecord[]): ConsentsView {
  const resolved = resolveConsents(
    events.map((e) => ({ type: e.type, granted: e.granted, at: e.createdAt })),
  );
  const current = {} as Record<ConsentType, { granted: boolean; at: string } | null>;
  for (const type of CONSENT_TYPES) {
    const entry = resolved[type];
    current[type] = entry ? { granted: entry.granted, at: entry.at.toISOString() } : null;
  }
  return { current, history: events.map(toConsentEventView) };
}

/** Sérialise un membre en vue API : dates ISO + statut **dérivé** de la période. */
function toView(record: MemberRecord, periodDays: number, now: Date): MemberView {
  return {
    id: record.id,
    memberNumber: record.memberNumber,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    phone: record.phone,
    address: record.address,
    birthDate: record.birthDate?.toISOString() ?? null,
    membership: deriveMembershipStatus(record.lastContributionAt, periodDays, now),
    roles: record.roles,
    lastContributionAt: record.lastContributionAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
