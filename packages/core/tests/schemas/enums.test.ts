import { describe, expect, it } from "vitest";

import {
  authMethodSchema,
  batchMilestoneKindSchema,
  batchStatusSchema,
  catalogKindSchema,
  displayTemplateSchema,
  ingredientCategorySchema,
  measureTypeSchema,
  recipeEngineSchema,
  recipeStatusSchema,
  reservationStatusSchema,
  stabilizationMethodSchema,
  stockMovementReasonSchema,
  stockUnitSchema,
  storageModeSchema,
} from "../../src/schemas/enums.js";

describe("Enums Zod — alignés Prisma (M1-01)", () => {
  it("recipeEngine = les 3 moteurs", () => {
    expect(recipeEngineSchema.options).toEqual(["BEER", "ALT_FERMENTED", "SOFT_DRINK"]);
    expect(recipeEngineSchema.parse("BEER")).toBe("BEER");
    expect(recipeEngineSchema.safeParse("WINE").success).toBe(false);
  });

  it("valeurs de référence des autres enums", () => {
    expect(recipeStatusSchema.options).toContain("PUBLISHED");
    expect(stabilizationMethodSchema.options).toContain("FILTRATION_ACIDIFICATION");
    expect(ingredientCategorySchema.options).toContain("HOP");
    expect(batchStatusSchema.options).toContain("EN_FERMENTATION");
    expect(measureTypeSchema.options).toEqual(["GRAVITY", "TEMPERATURE", "PH", "VOLUME", "OTHER"]);
    expect(catalogKindSchema.options).toContain("RECETTE");
    expect(stockUnitSchema.options).toEqual(["GRAM", "LITER", "UNIT"]);
    expect(stockMovementReasonSchema.options).toContain("PRODUCTION");
    expect(reservationStatusSchema.options).toEqual(["RESERVED", "CONSUMED", "RELEASED"]);
    expect(storageModeSchema.options).toEqual(["cold", "ambient"]);
  });

  describe("cycle brassin (M9-02) — miroir des enums Prisma étendus", () => {
    it("catalogKind porte PRODUIT_FINI, en dernière position comme en base", () => {
      // L'ordre compte : il doit reproduire celui de l'enum Prisma, sans quoi le
      // miroir core ↔ DB (ADR-03/04) diverge silencieusement.
      expect(catalogKindSchema.options).toEqual([
        "RECETTE",
        "BULK",
        "CONDITIONNEMENT",
        "PRODUIT_FINI",
      ]);
      expect(catalogKindSchema.parse("PRODUIT_FINI")).toBe("PRODUIT_FINI");
    });

    it("batchMilestoneKind suit la séquence du cycle (FORMULES §13.1)", () => {
      expect(batchMilestoneKindSchema.options).toEqual([
        "FERMENTATION",
        "DRY_HOP",
        "COLD_CRASH",
        "GARDE",
      ]);
    });

    it("batchMilestoneKind rejette une valeur inconnue", () => {
      expect(batchMilestoneKindSchema.safeParse("MATURATION").success).toBe(false);
      expect(batchMilestoneKindSchema.safeParse("fermentation").success).toBe(false);
      expect(batchMilestoneKindSchema.safeParse("").success).toBe(false);
    });

    it("les phases post-ensemencement ne recouvrent aucune phase Jour J", () => {
      // Garde-fou : `BatchMilestoneKind` et `DayPhase` décrivent deux temporalités
      // distinctes (quelques heures vs plusieurs semaines). Un chevauchement de
      // valeurs signalerait une confusion de modèle.
      const dayPhases = [
        "INITIALISATION",
        "EMPATAGE",
        "FILTRATION",
        "EBULLITION",
        "WHIRLPOOL",
        "REFROIDISSEMENT",
        "ENSEMENCEMENT",
        "TERMINE",
      ];
      for (const kind of batchMilestoneKindSchema.options) {
        expect(dayPhases).not.toContain(kind);
      }
    });
  });

  describe("options & identité (M10-04) — miroir des enums Prisma étendus", () => {
    it("authMethod = exactement PASSWORD/PIN, dans l'ordre de l'enum Prisma", () => {
      // Miroir de `enum AuthMethod { PASSWORD PIN }` (schema.prisma) : une
      // session ouverte par PIN doit rester distinguable d'une session par mot
      // de passe (ADR-13 §6) — toute divergence de valeurs casserait ce miroir
      // silencieusement (ADR-03/04).
      expect(authMethodSchema.options).toEqual(["PASSWORD", "PIN"]);
      expect(authMethodSchema.parse("PIN")).toBe("PIN");
      expect(authMethodSchema.safeParse("SSO").success).toBe(false);
    });

    it("displayTemplate n'a pas gagné de gabarit (non-régression, M10-04 §E)", () => {
      // Le ticket interdit explicitement tout nouvel enum de gabarit : la
      // demande M10 est de l'injection de marque (`defaultDisplayTemplate`
      // réutilise cet enum existant), pas une nouvelle famille de rendu.
      expect(displayTemplateSchema.options).toEqual(["LIST", "TABLE", "CARDS"]);
    });
  });
});
