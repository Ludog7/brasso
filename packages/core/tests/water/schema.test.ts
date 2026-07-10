import { describe, expect, it } from "vitest";

import { equipmentWaterProfilesSchema, waterProfileSchema } from "../../src/index.js";

describe("waterProfileSchema — profil d'eau (M3-02, Annexe D)", () => {
  it("round-trip : un profil complet est préservé à l'identique", () => {
    const profile = {
      name: "Réseau associatif",
      calcium: 40,
      magnesium: 10,
      sodium: 15,
      sulfate: 30,
      chloride: 20,
      bicarbonate: 100,
    };
    expect(waterProfileSchema.parse(profile)).toEqual(profile);
  });

  it("analyse partielle : les ions absents sont ramenés à 0, le nom reste optionnel", () => {
    expect(waterProfileSchema.parse({ calcium: 50 })).toEqual({
      calcium: 50,
      magnesium: 0,
      sodium: 0,
      sulfate: 0,
      chloride: 0,
      bicarbonate: 0,
    });
  });

  it("rejette une concentration ionique négative", () => {
    expect(waterProfileSchema.safeParse({ calcium: -1 }).success).toBe(false);
  });

  it("rejette un nom vide", () => {
    expect(waterProfileSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("equipmentWaterProfilesSchema — enveloppe équipement (JSONB, ADR-04)", () => {
  it("accepte base + cibles par style et complète les ions manquants", () => {
    const parsed = equipmentWaterProfilesSchema.parse({
      base: { name: "Réseau", calcium: 40 },
      targetsByStyle: {
        "american-ipa": { sulfate: 250, chloride: 60, calcium: 120 },
      },
    });
    expect(parsed.base?.calcium).toBe(40);
    expect(parsed.base?.bicarbonate).toBe(0);
    expect(parsed.targetsByStyle?.["american-ipa"].sulfate).toBe(250);
    expect(parsed.targetsByStyle?.["american-ipa"].magnesium).toBe(0);
  });

  it("accepte une enveloppe vide (aucun profil renseigné)", () => {
    expect(equipmentWaterProfilesSchema.parse({})).toEqual({});
  });

  it("rejette une clé de style vide", () => {
    expect(
      equipmentWaterProfilesSchema.safeParse({ targetsByStyle: { "": { calcium: 10 } } }).success,
    ).toBe(false);
  });
});
