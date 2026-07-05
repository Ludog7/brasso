import { describe, expect, it } from "vitest";

import { batchMeasureSchema } from "../../src/schemas/measurement.js";

const ok = (type: string, value: number): boolean =>
  batchMeasureSchema.safeParse({ type, value }).success;

describe("batchMeasureSchema — bornes de plausibilité par type", () => {
  it("GRAVITY : SG dans [0.99, 1.2]", () => {
    expect(ok("GRAVITY", 1.05)).toBe(true);
    expect(ok("GRAVITY", 1.5)).toBe(false);
    expect(ok("GRAVITY", 0.9)).toBe(false);
  });

  it("PH : [0, 14]", () => {
    expect(ok("PH", 4.2)).toBe(true);
    expect(ok("PH", 15)).toBe(false);
    expect(ok("PH", -0.1)).toBe(false);
  });

  it("TEMPERATURE : [-20, 120] °C", () => {
    expect(ok("TEMPERATURE", 66)).toBe(true);
    expect(ok("TEMPERATURE", 200)).toBe(false);
    expect(ok("TEMPERATURE", -30)).toBe(false);
  });

  it("VOLUME : ≥ 0", () => {
    expect(ok("VOLUME", 20)).toBe(true);
    expect(ok("VOLUME", -1)).toBe(false);
  });

  it("OTHER : aucune borne", () => {
    expect(ok("OTHER", 99999)).toBe(true);
  });

  it("value non fini rejeté", () => {
    expect(batchMeasureSchema.safeParse({ type: "VOLUME", value: Infinity }).success).toBe(false);
  });

  it("accepte unit/phase optionnels", () => {
    const m = batchMeasureSchema.parse({
      type: "GRAVITY",
      value: 1.048,
      unit: "SG",
      phase: "BOIL",
    });
    expect(m.phase).toBe("BOIL");
  });
});
