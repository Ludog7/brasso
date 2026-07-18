import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

/**
 * Non-régression bug #218 — le client web pose `content-type: application/json`
 * sur **tout** POST, y compris ceux **sans corps** (logout, publish, démarrage
 * Jour J…). L'API doit tolérer un corps JSON vide (sinon 400 → parcours cassés),
 * tout en refusant un JSON réellement invalide.
 */

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

describe("Parser content-type JSON (bug #218)", () => {
  it("accepte un POST sans corps portant content-type: application/json", async () => {
    const app = await buildApp({ config });
    try {
      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { "content-type": "application/json" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it("refuse toujours un corps JSON réellement invalide (400)", async () => {
    const app = await buildApp({ config });
    try {
      const res = await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { "content-type": "application/json" },
        payload: "{ pas du json",
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
