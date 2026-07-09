import { describe, expect, it } from "vitest";

import {
  type BrassoRecipeContent,
  BrassoRecipeEngineError,
  type BrassoRecipeEnvelope,
  BrassoRecipeValidationError,
  BrassoRecipeVersionError,
  exportRecipeJson,
  importRecipeJson,
} from "../../src/index.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Ginger beer publiée : ingrédients non standards, étape `STABILIZE`, sécurité. */
function gingerBeer(): BrassoRecipeContent {
  return {
    engine: "ALT_FERMENTED",
    recipe: {
      name: "Ginger Beer maison",
      status: "PUBLISHED",
      notes: "Fermentation courte, pasteurisée en bouteille.",
      altDetails: {
        baseType: "ginger",
        targetPh: 3.4,
        stabilizationMethod: "PASTEURIZATION",
        residualSugarRisk: true,
        batchVolumeL: 10,
      },
      ingredients: [
        { name: "Jus de gingembre frais", category: "ADJUNCT", amount: 500 },
        { name: "Sirop de sucre maison", category: "SUGAR", amount: 800 },
        { name: "Levure champagne", category: "YEAST", amount: 5 },
      ],
      steps: [
        { type: "BOIL", params: { timeMin: 15 } },
        { type: "FERMENT", params: { tempC: 20, days: 3 } },
        { type: "STABILIZE", params: { method: "PASTEURIZATION", tempC: 65 } },
      ],
    },
  };
}

/** Limonade citron publiée (stockage ambiant, pH acide). */
function lemonade(): BrassoRecipeContent {
  return {
    engine: "SOFT_DRINK",
    recipe: {
      name: "Limonade citron",
      status: "PUBLISHED",
      softDetails: {
        sugarConcentration: 90,
        targetPh: 3,
        storageMode: "ambient",
        stabilizationMethod: "THERMAL",
        batchVolumeL: 5,
      },
      ingredients: [
        { name: "Jus de citron", category: "ADJUNCT", amount: 300 },
        { name: "Sucre de canne", category: "SUGAR", amount: 450 },
      ],
      steps: [
        { type: "BOIL", params: { timeMin: 5 } },
        { type: "STABILIZE", params: { method: "THERMAL", tempC: 70 } },
      ],
    },
  };
}

/** Sérialise puis désérialise l'enveloppe : simule un partage inter-instance réel. */
function throughJson(envelope: BrassoRecipeEnvelope): unknown {
  return JSON.parse(JSON.stringify(envelope));
}

// ── Round-trip export → import ───────────────────────────────────────────────

describe("exportRecipeJson / importRecipeJson — aller-retour", () => {
  it("ginger beer (ALT) : réimport identique, paramètres de sécurité préservés", () => {
    const envelope = exportRecipeJson(gingerBeer());

    expect(envelope.format).toBe("brasso-recipe");
    expect(envelope.formatVersion).toBe(1);
    expect(envelope.engine).toBe("ALT_FERMENTED");
    // Critère fonctionnel observable : pH + méthode de stabilisation dans l'enveloppe.
    if (envelope.engine !== "ALT_FERMENTED") throw new Error("engine attendu ALT");
    expect(envelope.recipe.altDetails.targetPh).toBe(3.4);
    expect(envelope.recipe.altDetails.stabilizationMethod).toBe("PASTEURIZATION");

    expect(importRecipeJson(throughJson(envelope))).toEqual(envelope);
  });

  it("limonade (SOFT) : réimport identique", () => {
    const envelope = exportRecipeJson(lemonade());
    expect(envelope.engine).toBe("SOFT_DRINK");
    expect(importRecipeJson(throughJson(envelope))).toEqual(envelope);
  });

  it("normalise les défauts (statut, unité, ordre, tableaux) — aller-retour stable", () => {
    const envelope = exportRecipeJson({
      engine: "SOFT_DRINK",
      recipe: {
        name: "Sirop simple",
        softDetails: { sugarConcentration: 120 },
        ingredients: [{ name: "Sucre", category: "SUGAR", amount: 1000 }],
      },
    });
    expect(envelope.recipe.status).toBe("DRAFT");
    expect(envelope.recipe.steps).toEqual([]);
    expect(envelope.recipe.ingredients[0]?.unit).toBe("GRAM");
    expect(envelope.recipe.ingredients[0]?.sortOrder).toBe(0);
    // Idempotence : réimporter l'enveloppe normalisée ne change rien.
    expect(importRecipeJson(throughJson(envelope))).toEqual(envelope);
  });
});

// ── Rejets typés à l'import ──────────────────────────────────────────────────

describe("importRecipeJson — rejets typés", () => {
  it("formatVersion inconnu → BrassoRecipeVersionError", () => {
    const doc = { ...throughJson(exportRecipeJson(gingerBeer())), formatVersion: 2 };
    expect(() => importRecipeJson(doc)).toThrow(BrassoRecipeVersionError);
    try {
      importRecipeJson(doc);
    } catch (error) {
      expect(error).toBeInstanceOf(BrassoRecipeVersionError);
      expect((error as BrassoRecipeVersionError).formatVersion).toBe(2);
    }
  });

  it("moteur BEER → BrassoRecipeEngineError (renvoie vers BeerXML)", () => {
    const doc = { format: "brasso-recipe", formatVersion: 1, engine: "BEER", recipe: {} };
    expect(() => importRecipeJson(doc)).toThrow(BrassoRecipeEngineError);
    try {
      importRecipeJson(doc);
    } catch (error) {
      expect((error as BrassoRecipeEngineError).engine).toBe("BEER");
    }
  });

  it("payload invalide (nom manquant) → BrassoRecipeValidationError", () => {
    const doc = {
      format: "brasso-recipe",
      formatVersion: 1,
      engine: "ALT_FERMENTED",
      recipe: { altDetails: { baseType: "ginger" } },
    };
    expect(() => importRecipeJson(doc)).toThrow(BrassoRecipeValidationError);
    try {
      importRecipeJson(doc);
    } catch (error) {
      expect((error as BrassoRecipeValidationError).paths).toContain("recipe.name");
    }
  });

  it("clé inconnue au niveau enveloppe → rejet strict", () => {
    const doc = { ...throughJson(exportRecipeJson(lemonade())), extra: "nope" };
    expect(() => importRecipeJson(doc)).toThrow(BrassoRecipeValidationError);
  });

  it("format inconnu / entrée non-objet → BrassoRecipeValidationError", () => {
    expect(() =>
      importRecipeJson({ format: "autre", formatVersion: 1, engine: "SOFT_DRINK" }),
    ).toThrow(BrassoRecipeValidationError);
    expect(() => importRecipeJson(null)).toThrow(BrassoRecipeValidationError);
    expect(() => importRecipeJson("<xml/>")).toThrow(BrassoRecipeValidationError);
  });

  it("engine inconnu (ni BEER ni ALT/SOFT) → BrassoRecipeValidationError", () => {
    const doc = { format: "brasso-recipe", formatVersion: 1, engine: "WINE", recipe: {} };
    expect(() => importRecipeJson(doc)).toThrow(BrassoRecipeValidationError);
  });
});

// ── Règle de publication (ADR-06 / ADR-11) ───────────────────────────────────

describe("paramètres de sécurité obligatoires pour une recette publiée", () => {
  it("export d'une ALT publiée sans stabilisation ni pH → BrassoRecipeValidationError", () => {
    const content: BrassoRecipeContent = {
      engine: "ALT_FERMENTED",
      recipe: {
        name: "Ginger beer risquée",
        status: "PUBLISHED",
        altDetails: { baseType: "ginger" },
      },
    };
    expect(() => exportRecipeJson(content)).toThrow(BrassoRecipeValidationError);
    try {
      exportRecipeJson(content);
    } catch (error) {
      expect((error as BrassoRecipeValidationError).paths).toContain("recipe.altDetails");
    }
  });

  it("une ALT en DRAFT sans paramètres de sécurité s'exporte (règle ciblée sur PUBLISHED)", () => {
    const content: BrassoRecipeContent = {
      engine: "ALT_FERMENTED",
      recipe: { name: "Brouillon", status: "DRAFT", altDetails: { baseType: "ginger" } },
    };
    expect(() => exportRecipeJson(content)).not.toThrow();
  });

  it("SOFT publiée en stockage ambiant peu acide sans stabilisation → rejet", () => {
    const content: BrassoRecipeContent = {
      engine: "SOFT_DRINK",
      recipe: {
        name: "Boisson peu acide",
        status: "PUBLISHED",
        softDetails: { targetPh: 5, storageMode: "ambient" },
      },
    };
    expect(() => exportRecipeJson(content)).toThrow(BrassoRecipeValidationError);
  });

  it("SOFT publiée sans pH ni mode de conservation → rejet (pH obligatoire)", () => {
    const content: BrassoRecipeContent = {
      engine: "SOFT_DRINK",
      recipe: { name: "Limonade nue", status: "PUBLISHED", softDetails: {} },
    };
    expect(() => exportRecipeJson(content)).toThrow(BrassoRecipeValidationError);
    try {
      exportRecipeJson(content);
    } catch (error) {
      expect((error as BrassoRecipeValidationError).paths).toContain("recipe.softDetails");
    }
  });

  it("import d'une ALT publiée sans sécurité → rejet symétrique de l'export", () => {
    const doc = {
      format: "brasso-recipe",
      formatVersion: 1,
      engine: "ALT_FERMENTED",
      recipe: { name: "Publiée nue", status: "PUBLISHED", altDetails: { baseType: "ginger" } },
    };
    expect(() => importRecipeJson(doc)).toThrow(BrassoRecipeValidationError);
  });
});

// ── Cohérence moteur (réutilise les tables M2-02) ────────────────────────────

describe("cohérence moteur — ingrédients / étapes hors périmètre", () => {
  it("un houblon dans une recette ALT → rejet", () => {
    const content: BrassoRecipeContent = {
      engine: "ALT_FERMENTED",
      recipe: {
        name: "ALT houblonnée",
        status: "DRAFT",
        altDetails: { baseType: "ginger" },
        ingredients: [{ name: "Cascade", category: "HOP", amount: 20 }],
      },
    };
    expect(() => exportRecipeJson(content)).toThrow(BrassoRecipeValidationError);
    try {
      exportRecipeJson(content);
    } catch (error) {
      expect((error as BrassoRecipeValidationError).paths).toContain(
        "recipe.ingredients.0.category",
      );
    }
  });

  it("un palier d'empâtage (MASH_STEP) dans une recette SOFT → rejet", () => {
    const content: BrassoRecipeContent = {
      engine: "SOFT_DRINK",
      recipe: {
        name: "SOFT empâtée",
        status: "DRAFT",
        softDetails: { sugarConcentration: 80 },
        steps: [{ type: "MASH_STEP", params: { tempC: 65, timeMin: 60 } }],
      },
    };
    expect(() => exportRecipeJson(content)).toThrow(BrassoRecipeValidationError);
  });
});
