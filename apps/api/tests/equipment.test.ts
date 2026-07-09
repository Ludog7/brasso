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
  EquipmentListFilters,
  EquipmentProfileView,
  EquipmentRepository,
} from "../src/modules/equipment/repository.js";
import type { EquipmentCreateBody, EquipmentUpdateBody } from "../src/modules/equipment/schema.js";
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

class InMemoryEquipmentRepository implements EquipmentRepository {
  private store = new Map<string, EquipmentProfileView>();
  private seq = 0;

  list(filters: EquipmentListFilters): Promise<EquipmentProfileView[]> {
    let items = [...this.store.values()];
    if (filters.active !== undefined) items = items.filter((p) => p.isActive === filters.active);
    items.sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(items);
  }
  findById(id: string): Promise<EquipmentProfileView | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  create(data: EquipmentCreateBody): Promise<EquipmentProfileView> {
    const now = new Date();
    const profile: EquipmentProfileView = {
      id: `eq_${++this.seq}`,
      name: data.name,
      nominalVolumeL: data.nominalVolumeL,
      deadspaceL: data.deadspaceL,
      transferLossL: data.transferLossL,
      evaporationRateLPerHour: data.evaporationRateLPerHour,
      grainAbsorptionLPerKg: data.grainAbsorptionLPerKg,
      heatingPowerKw: data.heatingPowerKw ?? null,
      thermalMassKjPerC: data.thermalMassKjPerC ?? null,
      waterProfiles: data.waterProfiles ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(profile.id, profile);
    return Promise.resolve(profile);
  }
  update(id: string, data: EquipmentUpdateBody): Promise<EquipmentProfileView> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`profil ${id} absent (le service garantit son existence)`);
    const updated: EquipmentProfileView = {
      ...existing,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.nominalVolumeL !== undefined ? { nominalVolumeL: data.nominalVolumeL } : {}),
      ...(data.deadspaceL !== undefined ? { deadspaceL: data.deadspaceL } : {}),
      ...(data.transferLossL !== undefined ? { transferLossL: data.transferLossL } : {}),
      ...(data.evaporationRateLPerHour !== undefined
        ? { evaporationRateLPerHour: data.evaporationRateLPerHour }
        : {}),
      ...(data.grainAbsorptionLPerKg !== undefined
        ? { grainAbsorptionLPerKg: data.grainAbsorptionLPerKg }
        : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      updatedAt: new Date(),
    };
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
};

async function makeApp(): Promise<{ app: FastifyInstance; cookieFor: (u: string) => string }> {
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
  const equipment = new InMemoryEquipmentRepository();
  const app = await buildApp({ config, authRepository: auth, equipmentRepository: equipment });
  await app.ready();
  return { app, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

interface InjectOptions {
  cookie?: string;
  payload?: unknown;
}
function inject(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH",
  url: string,
  { cookie, payload }: InjectOptions = {},
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method,
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
    ...(payload !== undefined ? { payload } : {}),
  });
}

const PROFILE_BODY = {
  name: "Cuve 50 L",
  nominalVolumeL: 50,
  deadspaceL: 2,
  evaporationRateLPerHour: 3,
  grainAbsorptionLPerKg: 1,
};

describe("module equipment — CRUD des profils d'équipement (M3-03)", () => {
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    ({ app, cookieFor } = await makeApp());
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const create = async (body: unknown = PROFILE_BODY, user = "brasseur"): Promise<string> => {
    const res = await inject(app, "POST", "/api/equipment-profiles", {
      cookie: cookieFor(user),
      payload: body,
    });
    return res.json().profile.id;
  };

  it("crée puis relit un profil (défauts Zod appliqués, actif par défaut)", async () => {
    try {
      const res = await inject(app, "POST", "/api/equipment-profiles", {
        cookie: cookieFor("brasseur"),
        payload: PROFILE_BODY,
      });
      expect(res.statusCode).toBe(201);
      const { profile } = res.json();
      expect(profile).toMatchObject({
        name: "Cuve 50 L",
        nominalVolumeL: 50,
        deadspaceL: 2,
        transferLossL: 0, // défaut Zod
        isActive: true,
      });

      const read = await inject(app, "GET", `/api/equipment-profiles/${profile.id}`, {
        cookie: cookieFor("caisse"),
      });
      expect(read.statusCode).toBe(200);
      expect(read.json().profile.id).toBe(profile.id);
    } finally {
      await close();
    }
  });

  it("valide les entrées : volume nominal ≤ 0 → 400", async () => {
    try {
      const res = await inject(app, "POST", "/api/equipment-profiles", {
        cookie: cookieFor("brasseur"),
        payload: { ...PROFILE_BODY, nominalVolumeL: 0 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION");
    } finally {
      await close();
    }
  });

  it("désactive un profil : absent de la liste active, présent en inactifs", async () => {
    try {
      const id = await create();
      const off = await inject(app, "POST", `/api/equipment-profiles/${id}/deactivate`, {
        cookie: cookieFor("brasseur"),
      });
      expect(off.statusCode).toBe(200);
      expect(off.json().profile.isActive).toBe(false);

      const active = await inject(app, "GET", "/api/equipment-profiles?active=true", {
        cookie: cookieFor("brasseur"),
      });
      expect(active.json().profiles).toHaveLength(0);

      const inactive = await inject(app, "GET", "/api/equipment-profiles?active=false", {
        cookie: cookieFor("brasseur"),
      });
      expect(inactive.json().profiles).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("réactive un profil via PATCH isActive=true", async () => {
    try {
      const id = await create();
      await inject(app, "POST", `/api/equipment-profiles/${id}/deactivate`, {
        cookie: cookieFor("admin"),
      });
      const back = await inject(app, "PATCH", `/api/equipment-profiles/${id}`, {
        cookie: cookieFor("admin"),
        payload: { isActive: true, deadspaceL: 3 },
      });
      expect(back.statusCode).toBe(200);
      expect(back.json().profile).toMatchObject({ isActive: true, deadspaceL: 3 });
    } finally {
      await close();
    }
  });

  it("profil inexistant → 404", async () => {
    try {
      const res = await inject(app, "GET", "/api/equipment-profiles/nope", {
        cookie: cookieFor("brasseur"),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    } finally {
      await close();
    }
  });

  it("RBAC : caisse lit mais ne crée pas ; anonyme refusé", async () => {
    try {
      const id = await create();
      expect(
        (await inject(app, "GET", "/api/equipment-profiles", { cookie: cookieFor("caisse") }))
          .statusCode,
      ).toBe(200);

      const caisseCreate = await inject(app, "POST", "/api/equipment-profiles", {
        cookie: cookieFor("caisse"),
        payload: PROFILE_BODY,
      });
      expect(caisseCreate.statusCode).toBe(403);

      const caissePatch = await inject(app, "PATCH", `/api/equipment-profiles/${id}`, {
        cookie: cookieFor("caisse"),
        payload: { deadspaceL: 5 },
      });
      expect(caissePatch.statusCode).toBe(403);

      const anon = await inject(app, "GET", "/api/equipment-profiles");
      expect(anon.statusCode).toBe(401);
    } finally {
      await close();
    }
  });
});
