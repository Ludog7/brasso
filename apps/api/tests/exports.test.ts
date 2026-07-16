import { createHash } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from "../src/modules/auth/repository.js";
import type {
  ContributionExportRecord,
  DateRange,
  ExportRepository,
  MovementExportRecord,
  SaleExportRecord,
} from "../src/modules/exports/repository.js";
import { SESSION_COOKIE } from "../src/plugins/auth.js";

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");
const inRange = (d: Date, r: DateRange): boolean =>
  d.getTime() >= r.from.getTime() && d.getTime() <= r.to.getTime();

/** Repo exports mémoire : filtre par période comme l'adaptateur Prisma. */
class InMemoryExportRepository implements ExportRepository {
  sales: SaleExportRecord[] = [];
  contributions: ContributionExportRecord[] = [];
  movements: MovementExportRecord[] = [];

  listSales(range: DateRange): Promise<SaleExportRecord[]> {
    return Promise.resolve(this.sales.filter((s) => inRange(s.occurredAt, range)));
  }
  listContributions(range: DateRange): Promise<ContributionExportRecord[]> {
    return Promise.resolve(this.contributions.filter((c) => inRange(c.occurredAt, range)));
  }
  listMovements(range: DateRange): Promise<MovementExportRecord[]> {
    return Promise.resolve(this.movements.filter((m) => inRange(m.occurredAt, range)));
  }
}

class InMemoryAuthRepository implements AuthRepository {
  private byId = new Map<string, AuthUserRecord>();
  private sessions = new Map<string, SessionRecord>();
  addUser(u: AuthUserRecord): void {
    this.byId.set(u.id, u);
  }
  addSession(s: SessionRecord): void {
    this.sessions.set(s.tokenHash, s);
  }
  findUserByEmail(): Promise<AuthUserRecord | null> {
    return Promise.resolve(null);
  }
  findUserById(id: string): Promise<AuthUserRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
  createSession(s: SessionRecord): Promise<void> {
    this.sessions.set(s.tokenHash, s);
    return Promise.resolve();
  }
  findSessionByTokenHash(h: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.sessions.get(h) ?? null);
  }
  deleteSession(h: string): Promise<void> {
    this.sessions.delete(h);
    return Promise.resolve();
  }
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
};

/** Décode la réponse CSV : retire le BOM et découpe en lignes RFC 4180. */
function csvLines(body: string): string[] {
  return body.replace(/^\uFEFF/, "").split("\r\n");
}

describe("exports CSV comptables (M7-07)", () => {
  let repo: InMemoryExportRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    repo = new InMemoryExportRepository();
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
    app = await buildApp({ config, authRepository: auth, exportRepository: repo });
    await app.ready();
    cookieFor = (user) => app.signCookie(`tok_${user}`);
  });

  function get(url: string, user: string | undefined): ReturnType<FastifyInstance["inject"]> {
    return app.inject({
      method: "GET",
      url,
      ...(user ? { cookies: { [SESSION_COOKIE]: cookieFor(user) } } : {}),
    });
  }

  const RANGE = "?from=2026-07-01T00:00:00Z&to=2026-07-31T23:59:59Z";

  it("sales.csv : en-têtes HTTP, BOM, colonnes, montant euros, date ISO, échappement RFC 4180", async () => {
    repo.sales.push({
      occurredAt: new Date("2026-07-16T10:00:00.000Z"),
      amountCents: 450,
      currency: "EUR",
      paymentMethod: "POS",
      externalProductId: 'Blonde, "33cl"', // virgule + guillemets → doit être échappé
      externalId: "SUMUP-TX-1",
    });

    const res = await get(`/api/exports/sales.csv${RANGE}`, "caisse");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="sales.csv"');
    expect(res.body.charCodeAt(0)).toBe(0xfeff); // BOM Excel

    const lines = csvLines(res.body);
    expect(lines[0]).toBe("date,montant_eur,devise,moyen_paiement,produit,reference_externe");
    // Champ produit échappé (guillemets internes doublés) ; montant en euros.
    expect(lines[1]).toBe('2026-07-16T10:00:00.000Z,4.50,EUR,POS,"Blonde, ""33cl""",SUMUP-TX-1');
  });

  it("contributions.csv : libellé membre + référence", async () => {
    repo.contributions.push({
      occurredAt: new Date("2026-07-10T09:00:00.000Z"),
      amountCents: 2500,
      currency: "EUR",
      externalId: "HA-42",
      memberLabel: "Ada Lovelace",
    });

    const res = await get(`/api/exports/contributions.csv${RANGE}`, "admin");
    expect(res.statusCode).toBe(200);
    const lines = csvLines(res.body);
    expect(lines[0]).toBe("date,montant_eur,devise,membre,reference");
    expect(lines[1]).toBe("2026-07-10T09:00:00.000Z,25.00,EUR,Ada Lovelace,HA-42");
  });

  it("movements.csv : article, quantité (delta), motif", async () => {
    repo.movements.push({
      occurredAt: new Date("2026-07-12T14:00:00.000Z"),
      articleLabel: "Blonde 33cl",
      delta: -1,
      reason: "SALE",
      note: null,
    });

    const res = await get(`/api/exports/movements.csv${RANGE}`, "caisse");
    expect(res.statusCode).toBe(200);
    const lines = csvLines(res.body);
    expect(lines[0]).toBe("date,article,quantite,motif,montant_eur,note");
    expect(lines[1]).toBe("2026-07-12T14:00:00.000Z,Blonde 33cl,-1,SALE,,");
  });

  it("respecte le filtre from/to (une vente hors période est exclue)", async () => {
    repo.sales.push(
      {
        occurredAt: new Date("2026-07-16T10:00:00.000Z"), // dans la période
        amountCents: 450,
        currency: "EUR",
        paymentMethod: "POS",
        externalProductId: "P1",
        externalId: "IN",
      },
      {
        occurredAt: new Date("2026-06-16T10:00:00.000Z"), // hors période (juin)
        amountCents: 999,
        currency: "EUR",
        paymentMethod: "POS",
        externalProductId: "P2",
        externalId: "OUT",
      },
    );

    const res = await get(`/api/exports/sales.csv${RANGE}`, "caisse");
    const lines = csvLines(res.body);
    expect(lines).toHaveLength(2); // en-tête + 1 seule vente
    expect(lines[1]).toContain("IN");
    expect(res.body).not.toContain("OUT");
  });

  it("CSV vide : seulement la ligne d'en-tête si aucune donnée", async () => {
    const res = await get(`/api/exports/sales.csv${RANGE}`, "caisse");
    expect(res.statusCode).toBe(200);
    expect(csvLines(res.body)).toEqual([
      "date,montant_eur,devise,moyen_paiement,produit,reference_externe",
    ]);
  });

  it("RBAC : caisse/brasseur/admin OK ; rgpd refusé (403) ; non authentifié 401", async () => {
    for (const role of ["caisse", "brasseur", "admin"]) {
      expect((await get(`/api/exports/sales.csv${RANGE}`, role)).statusCode).toBe(200);
    }
    expect((await get(`/api/exports/sales.csv${RANGE}`, "rgpd")).statusCode).toBe(403);
    expect((await get(`/api/exports/sales.csv${RANGE}`, undefined)).statusCode).toBe(401);
  });
});
