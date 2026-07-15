/**
 * Accès aux données du module `members` (M6-04) — identité, rôles associatifs et
 * statut de cotisation. Le statut affiché est **dérivé** (core `deriveMembershipStatus`)
 * à partir de `lastContributionAt` (M6-01) et de la période `Settings.membershipPeriodDays` ;
 * la colonne `membership` sert de **cache** aux filtres de liste. Interface
 * injectable pour un repository en mémoire dans les tests.
 */

import type { AnonymizedIdentity, ContributionRecord } from "@brasso/core";
import type {
  AssociativeRole,
  ConsentType,
  MembershipStatus,
  Prisma,
  PrismaClient,
} from "@brasso/db";

import type { ConsentInput, MemberCreateInput, MemberUpdateInput } from "./schema.js";

export type { ContributionRecord } from "@brasso/core";

/** Vue DB-agnostique d'un membre. */
export interface MemberRecord {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  birthDate: Date | null;
  /** Cache du statut (source de vérité = dérivation `lastContributionAt` + période). */
  membership: MembershipStatus;
  roles: AssociativeRole[];
  lastContributionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Filtres + pagination de la liste des membres. */
export interface MemberListFilters {
  search?: string;
  membership?: MembershipStatus;
  limit: number;
  offset: number;
}

/** Résultat paginé d'une liste de membres. */
export interface MemberListResult {
  members: MemberRecord[];
  total: number;
}

/** Un événement de consentement historisé (append-only, §3.4). */
export interface ConsentEventRecord {
  id: string;
  type: ConsentType;
  granted: boolean;
  createdAt: Date;
}

/** Port d'accès aux membres (Prisma en prod, mémoire en test). */
export interface MemberRepository {
  list(filters: MemberListFilters): Promise<MemberListResult>;
  findById(id: string): Promise<MemberRecord | null>;
  findByMemberNumber(memberNumber: string): Promise<MemberRecord | null>;
  create(data: MemberCreateInput): Promise<MemberRecord>;
  update(id: string, patch: MemberUpdateInput): Promise<MemberRecord>;
  /** Durée de validité d'une cotisation (jours) — `Settings.membershipPeriodDays`. */
  membershipPeriodDays(): Promise<number>;
  /** Historique des consentements d'un membre, du plus ancien au plus récent. */
  listConsents(memberId: string): Promise<ConsentEventRecord[]>;
  /** Ajoute un événement de consentement (append-only). */
  addConsent(memberId: string, input: ConsentInput): Promise<ConsentEventRecord>;
  /** Cotisations rapprochées du membre (transactions `MEMBERSHIP`), pour l'export RGPD. */
  listContributions(memberId: string): Promise<ContributionRecord[]>;
  /**
   * Anonymise un membre (pseudonymisation §3.4) : applique le patch d'identité et
   * **délie** le compte `User` associé. Transactionnel. Conserve `memberNumber`,
   * `membership`, `roles` et tous les agrégats/audit (scalaires sans FK).
   */
  anonymize(id: string, patch: AnonymizedIdentity): Promise<MemberRecord>;
}

/** Adaptateur Prisma du module membres. */
export class PrismaMemberRepository implements MemberRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(filters: MemberListFilters): Promise<MemberListResult> {
    const where: Prisma.MemberWhereInput = {
      ...(filters.membership !== undefined ? { membership: filters.membership } : {}),
      ...(filters.search !== undefined
        ? {
            OR: [
              { lastName: { contains: filters.search, mode: "insensitive" } },
              { firstName: { contains: filters.search, mode: "insensitive" } },
              { memberNumber: { contains: filters.search, mode: "insensitive" } },
              { email: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.member.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: filters.offset,
        take: filters.limit,
      }),
      this.db.member.count({ where }),
    ]);
    return { members: rows, total };
  }

  async findById(id: string): Promise<MemberRecord | null> {
    return this.db.member.findUnique({ where: { id } });
  }

  async findByMemberNumber(memberNumber: string): Promise<MemberRecord | null> {
    return this.db.member.findUnique({ where: { memberNumber } });
  }

  async create(data: MemberCreateInput): Promise<MemberRecord> {
    return this.db.member.create({
      data: {
        memberNumber: data.memberNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        birthDate: data.birthDate ?? null,
        roles: data.roles,
      },
    });
  }

  async update(id: string, patch: MemberUpdateInput): Promise<MemberRecord> {
    return this.db.member.update({
      where: { id },
      data: {
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.address !== undefined ? { address: patch.address } : {}),
        ...(patch.birthDate !== undefined ? { birthDate: patch.birthDate } : {}),
        ...(patch.roles !== undefined ? { roles: patch.roles } : {}),
      },
    });
  }

  async membershipPeriodDays(): Promise<number> {
    const settings = await this.db.settings.findFirst({ select: { membershipPeriodDays: true } });
    return settings?.membershipPeriodDays ?? 365;
  }

  async listConsents(memberId: string): Promise<ConsentEventRecord[]> {
    return this.db.memberConsent.findMany({
      where: { memberId },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, granted: true, createdAt: true },
    });
  }

  async addConsent(memberId: string, input: ConsentInput): Promise<ConsentEventRecord> {
    return this.db.memberConsent.create({
      data: { memberId, type: input.type, granted: input.granted },
      select: { id: true, type: true, granted: true, createdAt: true },
    });
  }

  async listContributions(memberId: string): Promise<ContributionRecord[]> {
    const rows = await this.db.externalTransaction.findMany({
      where: { memberId, kind: "MEMBERSHIP" },
      orderBy: { occurredAt: "asc" },
      select: { amountCents: true, currency: true, occurredAt: true, externalId: true },
    });
    return rows.map((r) => ({
      amountCents: r.amountCents,
      currency: r.currency,
      occurredAt: r.occurredAt,
      reference: r.externalId,
    }));
  }

  async anonymize(id: string, patch: AnonymizedIdentity): Promise<MemberRecord> {
    const [member] = await this.db.$transaction([
      this.db.member.update({
        where: { id },
        data: {
          firstName: patch.firstName,
          lastName: patch.lastName,
          email: patch.email,
          phone: patch.phone,
          address: patch.address,
          birthDate: patch.birthDate,
        },
      }),
      this.db.user.updateMany({ where: { memberId: id }, data: { memberId: null } }),
    ]);
    return member;
  }
}
