import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

const testConfig: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "test-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

describe("GET /health", () => {
  it("répond 200 avec { status: ok }", async () => {
    const app = await buildApp({ config: testConfig });
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });

  it("renvoie une erreur normalisée sur route inconnue", async () => {
    const app = await buildApp({ config: testConfig });
    try {
      const res = await app.inject({ method: "GET", url: "/nope" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });
});
