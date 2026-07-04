import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from "../src/modules/auth/repository.js";
import { AuthService } from "../src/modules/auth/service.js";
import { SESSION_COOKIE } from "../src/plugins/auth.js";

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const PASSWORD = "correct-horse-battery-staple";

class InMemoryAuthRepository implements AuthRepository {
  private byEmail = new Map<string, AuthUserRecord>();
  private byId = new Map<string, AuthUserRecord>();
  private sessions = new Map<string, SessionRecord>();

  addUser(user: AuthUserRecord): void {
    this.byEmail.set(user.email, user);
    this.byId.set(user.id, user);
  }

  findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return Promise.resolve(this.byEmail.get(email) ?? null);
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

async function makeApp(): Promise<FastifyInstance> {
  const repo = new InMemoryAuthRepository();
  const passwordHash = await new AuthService(repo).hashPassword(PASSWORD);
  repo.addUser({
    id: "u1",
    email: "admin@brasso.test",
    displayName: "Admin",
    passwordHash,
    isActive: true,
    roles: ["admin"],
  });
  return buildApp({ config, authRepository: repo });
}

function sessionCookie(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  return res.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
}

describe("auth", () => {
  it("login → me → logout (cycle complet)", async () => {
    const app = await makeApp();
    try {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "admin@brasso.test", password: PASSWORD },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json()).toMatchObject({ user: { email: "admin@brasso.test" } });
      const cookie = sessionCookie(login);
      expect(cookie).toBeTruthy();

      const me = await app.inject({
        method: "GET",
        url: "/auth/me",
        cookies: { [SESSION_COOKIE]: cookie! },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ user: { email: "admin@brasso.test" } });

      const logout = await app.inject({
        method: "POST",
        url: "/auth/logout",
        cookies: { [SESSION_COOKIE]: cookie! },
      });
      expect(logout.statusCode).toBe(200);

      const meAfter = await app.inject({
        method: "GET",
        url: "/auth/me",
        cookies: { [SESSION_COOKIE]: cookie! },
      });
      expect(meAfter.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("mauvais mot de passe → 401 sans cookie, message indifférencié", async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "admin@brasso.test", password: "wrong" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
      expect(sessionCookie(res)).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("email inconnu → 401 (même réponse que mauvais mot de passe)", async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "ghost@brasso.test", password: PASSWORD },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
    } finally {
      await app.close();
    }
  });

  it("/auth/me sans session → 401", async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({ method: "GET", url: "/auth/me" });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    } finally {
      await app.close();
    }
  });

  it("rate-limit sur /auth/login (429 après 5 tentatives)", async () => {
    const app = await makeApp();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: "admin@brasso.test", password: "wrong" },
        });
        codes.push(res.statusCode);
      }
      expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(codes[5]).toBe(429);
    } finally {
      await app.close();
    }
  });
});
