import { createHash } from "node:crypto";

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
import { AuditService } from "../src/modules/audit/service.js";
import type {
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from "../src/modules/auth/repository.js";
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

/** Journal d'audit en mémoire : append-only, filtres + tri desc + pagination. */
class InMemoryAuditRepository implements AuditRepository {
  private rows: AuditEntryRecord[] = [];
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
      createdAt: new Date(Date.UTC(2026, 0, this.seq)), // dates croissantes déterministes
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  list(filters: AuditListFilters): Promise<AuditListResult> {
    let rows = [...this.rows];
    if (filters.memberId !== undefined) rows = rows.filter((r) => r.memberId === filters.memberId);
    if (filters.resourceType !== undefined)
      rows = rows.filter((r) => r.resourceType === filters.resourceType);
    if (filters.action !== undefined) rows = rows.filter((r) => r.action === filters.action);
    if (filters.from !== undefined) rows = rows.filter((r) => r.createdAt >= filters.from!);
    if (filters.to !== undefined) rows = rows.filter((r) => r.createdAt <= filters.to!);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = rows.length;
    const entries = rows.slice(filters.offset, filters.offset + filters.limit);
    return Promise.resolve({ entries, total });
  }
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
};

async function makeApp(
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
  const app = await buildApp({ config, authRepository: auth, auditRepository: audit });
  await app.ready();
  return { app, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

function get(
  app: FastifyInstance,
  url: string,
  cookie?: string,
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method: "GET",
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
  });
}

describe("journal d'audit (M6-03)", () => {
  let repo: InMemoryAuditRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    repo = new InMemoryAuditRepository();
    // Historique seedé via le helper d'écriture (append-only).
    await repo.record({
      userId: "admin",
      action: "MEMBER_CREATE",
      resourceType: "member",
      memberId: "m1",
    });
    await repo.record({
      userId: "rgpd",
      action: "MEMBER_READ",
      resourceType: "member",
      memberId: "m2",
    });
    await repo.record({
      userId: "rgpd",
      action: "MEMBER_ANONYMIZE",
      resourceType: "member",
      memberId: "m1",
    });
    ({ app, cookieFor } = await makeApp(repo));
  });

  it("liste les entrées, du plus récent au plus ancien (admin)", async () => {
    const res = await get(app, "/api/audit", cookieFor("admin"));
    expect(res.statusCode).toBe(200);
    const body = res.json() as { entries: { action: string }[]; total: number };
    expect(body.total).toBe(3);
    expect(body.entries.map((e) => e.action)).toEqual([
      "MEMBER_ANONYMIZE",
      "MEMBER_READ",
      "MEMBER_CREATE",
    ]);
  });

  it("filtre par memberId", async () => {
    const res = await get(app, "/api/audit?memberId=m1", cookieFor("rgpd"));
    const body = res.json() as { entries: { memberId: string }[]; total: number };
    expect(body.total).toBe(2);
    expect(body.entries.every((e) => e.memberId === "m1")).toBe(true);
  });

  it("filtre par action et par resourceType", async () => {
    const byAction = await get(app, "/api/audit?action=MEMBER_READ", cookieFor("admin"));
    expect((byAction.json() as { total: number }).total).toBe(1);
    const byType = await get(app, "/api/audit?resourceType=member", cookieFor("admin"));
    expect((byType.json() as { total: number }).total).toBe(3);
  });

  it("pagine (limit/offset) tout en renvoyant le total", async () => {
    const res = await get(app, "/api/audit?limit=2&offset=1", cookieFor("admin"));
    const body = res.json() as { entries: unknown[]; total: number; limit: number; offset: number };
    expect(body.total).toBe(3);
    expect(body.entries).toHaveLength(2);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(1);
  });

  it("RBAC : admin et rgpd OK ; brasseur/caisse 403 ; anonyme 401", async () => {
    expect((await get(app, "/api/audit", cookieFor("admin"))).statusCode).toBe(200);
    expect((await get(app, "/api/audit", cookieFor("rgpd"))).statusCode).toBe(200);
    expect((await get(app, "/api/audit", cookieFor("brasseur"))).statusCode).toBe(403);
    expect((await get(app, "/api/audit", cookieFor("caisse"))).statusCode).toBe(403);
    expect((await get(app, "/api/audit")).statusCode).toBe(401);
  });
});

describe("AuditService.record (helper append-only)", () => {
  it("insère une entrée relisible via list", async () => {
    const service = new AuditService(new InMemoryAuditRepository());
    const created = await service.record({
      userId: "u1",
      action: "CONTRIBUTION_RECONCILE",
      resourceType: "transaction",
      memberId: "m9",
      metadata: { amountCents: 2500 },
    });
    expect(created.id).toBeTruthy();
    const { entries, total } = await service.list({ limit: 50, offset: 0 });
    expect(total).toBe(1);
    expect(entries[0]?.action).toBe("CONTRIBUTION_RECONCILE");
    expect(entries[0]?.memberId).toBe("m9");
  });
});
