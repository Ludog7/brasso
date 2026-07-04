import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("échoue explicitement si une variable requise manque", () => {
    expect(() => loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toThrow(/invalide/i);
  });

  it("applique les valeurs par défaut sur une config minimale valide", () => {
    const cfg = loadConfig({
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      SESSION_SECRET: "0123456789abcdef0",
    } as NodeJS.ProcessEnv);
    expect(cfg.API_PORT).toBe(3000);
    expect(cfg.NODE_ENV).toBe("development");
    expect(cfg.RATE_LIMIT_MAX).toBe(100);
  });
});
