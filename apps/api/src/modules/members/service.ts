/**
 * Orchestration du module `members` (M6-04) : CRUD identité + rôles, **statut de
 * cotisation dérivé** à la lecture (core `deriveMembershipStatus`) et **audit** de
 * tout accès/écriture de donnée personnelle (§6, helper `AuditService.record`).
 * La suppression n'est pas exposée (droit à l'effacement = anonymisation, M6-06).
 */

import { deriveMembershipStatus } from "@brasso/core";
import type { AssociativeRole, MembershipStatus } from "@brasso/db";

import type { AuditService } from "../audit/service.js";
import type { MemberListFilters, MemberRecord, MemberRepository } from "./repository.js";
import type { MemberCreateInput, MemberUpdateInput } from "./schema.js";

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

  private async requireMember(id: string): Promise<MemberRecord> {
    const record = await this.repo.findById(id);
    if (!record) {
      throw new MemberNotFoundError(id);
    }
    return record;
  }
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
