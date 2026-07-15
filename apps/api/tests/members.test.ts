import { createHash } from "node:crypto";

import type { AnonymizedIdentity, ContributionRecord } from "@brasso/core";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  AuditEntryRecord,
  AuditInsert,
  AuditListFilters,
  AuditListResult,
  AuditRepository,
} from "../src/modules/audit/repository.js";
import type {
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from "../src/modules/auth/repository.js";
import type {
  ConsentEventRecord,
  MemberListFilters,
  MemberListResult,
  MemberRecord,
  MemberRepository,
} from "../src/modules/members/repository.js";
import type {
  ConsentInput,
  MemberCreateInput,
  MemberUpdateInput,
} from "../src/modules/members/schema.js";
import { SESSION_COOKIE } from "../src/plugins/auth.js";

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const DAY = 24 * 60 * 60 * 1000;

class InMemoryAuthRepository implements AuthRepository {
  private byId = new Map<string, AuthUserRecord>();
  private sessions = new Map<string, SessionRecord>();
  addUser(user: AuthUserRecord): void {
    this.byId.set(user.id, user);
  }
  addSession(session: SessionRecord): void {
    this.sessions.set(session.tokenHash, session);
  }
  findUserByEmail(): Promise<AuthUserRecord | null> {
    return Promise.resolve(null);
  }
  findUserById(id: string): Promise<AuthUserRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
  createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.tokenHash, session);
    return Promise.resolve();
  }
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.sessions.get(tokenHash) ?? null);
  }
  deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }
}

class InMemoryAuditRepository implements AuditRepository {
  readonly rows: AuditEntryRecord[] = [];
  private seq = 0;
  record(entry: AuditInsert): Promise<AuditEntryRecord> {
    const row: AuditEntryRecord = {
      id: `a${++this.seq}`,
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      memberId: entry.memberId ?? null,
      ip: entry.ip ?? null,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
  list(filters: AuditListFilters): Promise<AuditListResult> {
    let rows = [...this.rows];
    if (filters.memberId !== undefined) rows = rows.filter((r) => r.memberId === filters.memberId);
    if (filters.action !== undefined) rows = rows.filter((r) => r.action === filters.action);
    if (filters.resourceType !== undefined)
      rows = rows.filter((r) => r.resourceType === filters.resourceType);
    return Promise.resolve({
      entries: rows.slice(filters.offset, filters.offset + filters.limit),
      total: rows.length,
    });
  }
}

class InMemoryMemberRepository implements MemberRepository {
  private rows: MemberRecord[] = [];
  private seq = 0;
  constructor(private readonly periodDays = 365) {}

  seed(
    partial: Partial<MemberRecord> & Pick<MemberRecord, "memberNumber" | "firstName" | "lastName">,
  ): MemberRecord {
    const now = new Date();
    const row: MemberRecord = {
      id: partial.id ?? `m${++this.seq}`,
      memberNumber: partial.memberNumber,
      firstName: partial.firstName,
      lastName: partial.lastName,
      email: partial.email ?? null,
      phone: partial.phone ?? null,
      address: partial.address ?? null,
      birthDate: partial.birthDate ?? null,
      membership: partial.membership ?? "EN_RETARD",
      roles: partial.roles ?? [],
      lastContributionAt: partial.lastContributionAt ?? null,
      createdAt: partial.createdAt ?? now,
      updatedAt: partial.updatedAt ?? now,
    };
    this.rows.push(row);
    return row;
  }

  list(filters: MemberListFilters): Promise<MemberListResult> {
    let rows = [...this.rows];
    if (filters.membership !== undefined)
      rows = rows.filter((r) => r.membership === filters.membership);
    if (filters.search !== undefined) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((r) =>
        [r.lastName, r.firstName, r.memberNumber, r.email ?? ""].some((v) =>
          v.toLowerCase().includes(q),
        ),
      );
    }
    rows.sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );
    const total = rows.length;
    const members = rows.slice(filters.offset, filters.offset + filters.limit);
    return Promise.resolve({ members, total });
  }
  findById(id: string): Promise<MemberRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  findByMemberNumber(memberNumber: string): Promise<MemberRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.memberNumber === memberNumber) ?? null);
  }
  create(data: MemberCreateInput): Promise<MemberRecord> {
    return Promise.resolve(
      this.seed({
        memberNumber: data.memberNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        birthDate: data.birthDate ?? null,
        roles: data.roles,
      }),
    );
  }
  update(id: string, patch: MemberUpdateInput): Promise<MemberRecord> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error("not found (should be guarded by service)");
    Object.assign(row, patch, { updatedAt: new Date() });
    return Promise.resolve(row);
  }
  membershipPeriodDays(): Promise<number> {
    return Promise.resolve(this.periodDays);
  }

  private consents = new Map<string, ConsentEventRecord[]>();
  private consentSeq = 0;
  listConsents(memberId: string): Promise<ConsentEventRecord[]> {
    return Promise.resolve([...(this.consents.get(memberId) ?? [])]);
  }
  addConsent(memberId: string, input: ConsentInput): Promise<ConsentEventRecord> {
    const event: ConsentEventRecord = {
      id: `c${++this.consentSeq}`,
      type: input.type,
      granted: input.granted,
      createdAt: new Date(Date.UTC(2026, 0, this.consentSeq)), // dates croissantes déterministes
    };
    const list = this.consents.get(memberId) ?? [];
    list.push(event);
    this.consents.set(memberId, list);
    return Promise.resolve(event);
  }

  contributions = new Map<string, ContributionRecord[]>();
  seedContribution(memberId: string, contribution: ContributionRecord): void {
    const list = this.contributions.get(memberId) ?? [];
    list.push(contribution);
    this.contributions.set(memberId, list);
  }
  listContributions(memberId: string): Promise<ContributionRecord[]> {
    return Promise.resolve([...(this.contributions.get(memberId) ?? [])]);
  }
  anonymize(id: string, patch: AnonymizedIdentity): Promise<MemberRecord> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error("not found (should be guarded by service)");
    Object.assign(row, patch, { updatedAt: new Date() });
    return Promise.resolve(row);
  }
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
};

async function makeApp(
  members: InMemoryMemberRepository,
  audit: InMemoryAuditRepository,
): Promise<{ app: FastifyInstance; cookieFor: (u: string) => string }> {
  const auth = new InMemoryAuthRepository();
  const future = new Date(Date.now() + 3_600_000);
  for (const [id, roles] of Object.entries(USERS)) {
    auth.addUser({
      id,
      email: `${id}@brasso.test`,
      displayName: id,
      passwordHash: "x",
      isActive: true,
      roles,
    });
    auth.addSession({ tokenHash: sha256(`tok_${id}`), userId: id, expiresAt: future });
  }
  const app = await buildApp({
    config,
    authRepository: auth,
    memberRepository: members,
    auditRepository: audit,
  });
  await app.ready();
  return { app, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

function req(
  app: FastifyInstance,
  method: string,
  url: string,
  cookie: string | undefined,
  payload?: unknown,
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method: method as "GET",
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
    ...(payload !== undefined ? { payload } : {}),
  });
}

describe("fichier membres (M6-04)", () => {
  let members: InMemoryMemberRepository;
  let audit: InMemoryAuditRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    members = new InMemoryMemberRepository(365);
    audit = new InMemoryAuditRepository();
    members.seed({ id: "m-ada", memberNumber: "A-001", firstName: "Ada", lastName: "Lovelace" });
    members.seed({
      id: "m-grace",
      memberNumber: "A-002",
      firstName: "Grace",
      lastName: "Hopper",
      lastContributionAt: new Date(Date.now() - 30 * DAY),
      membership: "A_JOUR",
    });
    ({ app, cookieFor } = await makeApp(members, audit));
  });

  it("liste et recherche les membres (admin)", async () => {
    const all = await req(app, "GET", "/api/members", cookieFor("admin"));
    expect(all.statusCode).toBe(200);
    expect((all.json() as { total: number }).total).toBe(2);

    const search = await req(app, "GET", "/api/members?search=hopper", cookieFor("admin"));
    const body = search.json() as { members: { memberNumber: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.members[0]?.memberNumber).toBe("A-002");
  });

  it("dérive le statut de cotisation à la lecture (période 365 j)", async () => {
    const res = await req(app, "GET", "/api/members", cookieFor("admin"));
    const byId = Object.fromEntries(
      (res.json() as { members: { id: string; membership: string }[] }).members.map((m) => [
        m.id,
        m.membership,
      ]),
    );
    expect(byId["m-grace"]).toBe("A_JOUR"); // cotisation il y a 30 j
    expect(byId["m-ada"]).toBe("EN_RETARD"); // jamais cotisé
  });

  it("consulte un membre et audite l'accès personnel (MEMBER_READ)", async () => {
    const res = await req(app, "GET", "/api/members/m-ada", cookieFor("rgpd"));
    expect(res.statusCode).toBe(200);
    expect((res.json() as { member: { memberNumber: string } }).member.memberNumber).toBe("A-001");
    expect(audit.rows.some((e) => e.action === "MEMBER_READ" && e.memberId === "m-ada")).toBe(true);
  });

  it("crée un membre (201 + MEMBER_CREATE) et refuse un numéro déjà pris (409)", async () => {
    const created = await req(app, "POST", "/api/members", cookieFor("admin"), {
      memberNumber: "A-003",
      firstName: "Alan",
      lastName: "Turing",
      roles: ["ADHERENT"],
    });
    expect(created.statusCode).toBe(201);
    expect(audit.rows.some((e) => e.action === "MEMBER_CREATE")).toBe(true);

    const clash = await req(app, "POST", "/api/members", cookieFor("admin"), {
      memberNumber: "A-001",
      firstName: "Autre",
      lastName: "Ada",
    });
    expect(clash.statusCode).toBe(409);
  });

  it("rectifie un membre (PATCH + MEMBER_UPDATE) ; 404 si absent", async () => {
    const patched = await req(app, "PATCH", "/api/members/m-ada", cookieFor("rgpd"), {
      phone: "0600000000",
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { member: { phone: string } }).member.phone).toBe("0600000000");
    expect(audit.rows.some((e) => e.action === "MEMBER_UPDATE" && e.memberId === "m-ada")).toBe(
      true,
    );

    const missing = await req(app, "PATCH", "/api/members/nope", cookieFor("rgpd"), {
      phone: "0",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("RBAC : admin/rgpd OK ; brasseur/caisse 403 ; anonyme 401", async () => {
    expect((await req(app, "GET", "/api/members", cookieFor("admin"))).statusCode).toBe(200);
    expect((await req(app, "GET", "/api/members", cookieFor("rgpd"))).statusCode).toBe(200);
    expect((await req(app, "GET", "/api/members", cookieFor("brasseur"))).statusCode).toBe(403);
    expect((await req(app, "GET", "/api/members", cookieFor("caisse"))).statusCode).toBe(403);
    expect((await req(app, "GET", "/api/members", undefined)).statusCode).toBe(401);
  });
});

describe("consentements RGPD historisés (M6-05)", () => {
  let members: InMemoryMemberRepository;
  let audit: InMemoryAuditRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    members = new InMemoryMemberRepository(365);
    audit = new InMemoryAuditRepository();
    members.seed({ id: "m1", memberNumber: "A-001", firstName: "Ada", lastName: "Lovelace" });
    ({ app, cookieFor } = await makeApp(members, audit));
  });

  it("ajoute des événements append-only et résout l'état courant (dernier par type)", async () => {
    // Octroi puis retrait de COMMUNICATION ; octroi de PHOTOS.
    await req(app, "POST", "/api/members/m1/consents", cookieFor("rgpd"), {
      type: "COMMUNICATION",
      granted: true,
    });
    await req(app, "POST", "/api/members/m1/consents", cookieFor("rgpd"), {
      type: "PHOTOS",
      granted: true,
    });
    const last = await req(app, "POST", "/api/members/m1/consents", cookieFor("rgpd"), {
      type: "COMMUNICATION",
      granted: false,
    });
    expect(last.statusCode).toBe(201);

    const res = await req(app, "GET", "/api/members/m1/consents", cookieFor("admin"));
    const body = res.json() as {
      current: Record<string, { granted: boolean } | null>;
      history: unknown[];
    };
    expect(body.history).toHaveLength(3); // append-only : rien n'est écrasé
    expect(body.current.COMMUNICATION).toMatchObject({ granted: false }); // dernier = retrait
    expect(body.current.PHOTOS).toMatchObject({ granted: true });
    expect(body.current.NOTIFICATIONS_LEGALES).toBeNull();
  });

  it("trace CONSENT_CHANGE et CONSENT_READ", async () => {
    await req(app, "POST", "/api/members/m1/consents", cookieFor("rgpd"), {
      type: "PHOTOS",
      granted: true,
    });
    await req(app, "GET", "/api/members/m1/consents", cookieFor("rgpd"));
    expect(audit.rows.some((e) => e.action === "CONSENT_CHANGE" && e.memberId === "m1")).toBe(true);
    expect(audit.rows.some((e) => e.action === "CONSENT_READ" && e.memberId === "m1")).toBe(true);
  });

  it("404 si le membre est inconnu ; RBAC (brasseur 403)", async () => {
    const missing = await req(app, "GET", "/api/members/nope/consents", cookieFor("admin"));
    expect(missing.statusCode).toBe(404);
    const denied = await req(app, "POST", "/api/members/m1/consents", cookieFor("brasseur"), {
      type: "PHOTOS",
      granted: true,
    });
    expect(denied.statusCode).toBe(403);
  });
});

describe("RGPD — export & anonymisation (M6-06)", () => {
  let members: InMemoryMemberRepository;
  let audit: InMemoryAuditRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    members = new InMemoryMemberRepository(365);
    audit = new InMemoryAuditRepository();
    members.seed({
      id: "m1",
      memberNumber: "A-001",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.org",
      phone: "0600000000",
    });
    members.seedContribution("m1", {
      amountCents: 2500,
      currency: "EUR",
      occurredAt: new Date("2026-01-15T00:00:00Z"),
      reference: "HA-1",
    });
    ({ app, cookieFor } = await makeApp(members, audit));
  });

  it("exporte le dossier complet (rgpd) ; admin interdit (403)", async () => {
    await req(app, "POST", "/api/members/m1/consents", cookieFor("rgpd"), {
      type: "PHOTOS",
      granted: true,
    });
    const res = await req(app, "GET", "/api/members/m1/export", cookieFor("rgpd"));
    expect(res.statusCode).toBe(200);
    const dossier = res.json() as {
      schemaVersion: number;
      member: { memberNumber: string };
      consents: { current: Record<string, unknown>; history: unknown[] };
      contributions: unknown[];
      auditTrail: unknown[];
    };
    expect(dossier.schemaVersion).toBe(1);
    expect(dossier.member.memberNumber).toBe("A-001");
    expect(dossier.contributions).toHaveLength(1);
    expect(dossier.consents.history).toHaveLength(1);
    expect(dossier.auditTrail.length).toBeGreaterThan(0);
    expect(audit.rows.some((e) => e.action === "MEMBER_EXPORT")).toBe(true);

    // export/anonymize réservés à `rgpd` : admin (CRUD membres) est refusé.
    expect((await req(app, "GET", "/api/members/m1/export", cookieFor("admin"))).statusCode).toBe(
      403,
    );
  });

  it("anonymise (efface la PII, conserve numéro/agrégats) ; irréversible (409)", async () => {
    const res = await req(app, "POST", "/api/members/m1/anonymize", cookieFor("rgpd"));
    expect(res.statusCode).toBe(200);
    const member = (res.json() as { member: MemberRecordView }).member;
    expect(member.email).toBeNull();
    expect(member.phone).toBeNull();
    expect(member.firstName).toBe("Membre");
    expect(member.memberNumber).toBe("A-001"); // agrégat préservé
    expect(audit.rows.some((e) => e.action === "MEMBER_ANONYMIZE")).toBe(true);

    // Les cotisations et la piste d'audit demeurent après anonymisation.
    const dossier = await req(app, "GET", "/api/members/m1/export", cookieFor("rgpd"));
    expect((dossier.json() as { contributions: unknown[] }).contributions).toHaveLength(1);

    // 2ᵉ appel → 409 (irréversible).
    const again = await req(app, "POST", "/api/members/m1/anonymize", cookieFor("rgpd"));
    expect(again.statusCode).toBe(409);
  });

  it("RBAC anonymize : admin 403, brasseur 403 ; 404 si absent", async () => {
    expect(
      (await req(app, "POST", "/api/members/m1/anonymize", cookieFor("admin"))).statusCode,
    ).toBe(403);
    expect(
      (await req(app, "POST", "/api/members/m1/anonymize", cookieFor("brasseur"))).statusCode,
    ).toBe(403);
    expect(
      (await req(app, "POST", "/api/members/nope/anonymize", cookieFor("rgpd"))).statusCode,
    ).toBe(404);
  });
});

/** Vue partielle d'un membre renvoyée par l'API (assez pour les assertions). */
interface MemberRecordView {
  memberNumber: string;
  firstName: string;
  email: string | null;
  phone: string | null;
}
