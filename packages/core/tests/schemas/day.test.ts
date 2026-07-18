import { describe, expect, it } from "vitest";

import { dayEventSchema, dayPlanSchema, dayStateSchema } from "../../src/schemas/day.js";
import { buildDayPlan } from "../../src/stateMachine/buildPlan.js";
import { initDayState, transition } from "../../src/stateMachine/machine.js";
import type { DayEvent } from "../../src/stateMachine/types.js";

const accepts = (event: unknown): boolean => dayEventSchema.safeParse(event).success;

describe("dayEventSchema — validation des événements Jour J", () => {
  it("accepte chaque variante bien formée", () => {
    expect(accepts({ type: "START_STEP", at: 0 })).toBe(true);
    expect(
      accepts({ type: "CONFIRM_STABILIZATION", at: 1, temperatureC: 66, source: "sensor" }),
    ).toBe(true);
    expect(accepts({ type: "CONFIRM_STABILIZATION", at: 1 })).toBe(true);
    expect(accepts({ type: "RECORD_MEASUREMENT", at: 2, kind: "density", value: 1.048 })).toBe(
      true,
    );
    expect(accepts({ type: "VALIDATE_STEP", at: 3 })).toBe(true);
    expect(accepts({ type: "FORCE_STEP", at: 4, author: "ludo", reason: "sonde HS" })).toBe(true);
  });

  it("rejette un FORCE_STEP sans motif ou sans auteur", () => {
    expect(accepts({ type: "FORCE_STEP", at: 4, author: "ludo", reason: "" })).toBe(false);
    expect(accepts({ type: "FORCE_STEP", at: 4, author: "", reason: "sonde HS" })).toBe(false);
    expect(accepts({ type: "FORCE_STEP", at: 4, reason: "sonde HS" })).toBe(false);
  });

  it("rejette un `at` non entier ou négatif (epoch ms serveur)", () => {
    expect(accepts({ type: "START_STEP", at: -1 })).toBe(false);
    expect(accepts({ type: "START_STEP", at: 1.5 })).toBe(false);
    expect(accepts({ type: "START_STEP" })).toBe(false);
  });

  it("rejette une mesure de kind inconnu ou de valeur non finie", () => {
    expect(accepts({ type: "RECORD_MEASUREMENT", at: 2, kind: "color", value: 10 })).toBe(false);
    expect(accepts({ type: "RECORD_MEASUREMENT", at: 2, kind: "ph", value: Infinity })).toBe(false);
  });

  it("rejette un type d'événement inconnu et une source hors énumération", () => {
    expect(accepts({ type: "PAUSE", at: 0 })).toBe(false);
    expect(accepts({ type: "CONFIRM_STABILIZATION", at: 1, source: "robot" })).toBe(false);
  });

  it("un événement validé est directement consommable par `transition`", () => {
    const parsed = dayEventSchema.parse({ type: "START_STEP", at: 0 });
    const state = initDayState(buildDayPlan({ recipeSnapshot: { steps: [] } }));
    const res = transition(state, parsed as DayEvent);
    expect(res.rejection).toBeUndefined();
  });
});

describe("dayPlanSchema / dayStateSchema — round-trip de l'instantané JSONB", () => {
  const plan = buildDayPlan({
    recipeSnapshot: {
      steps: [
        { type: "MASH_STEP", params: { tempC: 66, timeMin: 60 } },
        { type: "BOIL", params: { timeMin: 60 } },
        { type: "FERMENT", params: {} },
      ],
    },
  });

  it("valide un plan dérivé et rejette une phase inconnue", () => {
    expect(dayPlanSchema.safeParse(plan).success).toBe(true);
    expect(
      dayPlanSchema.safeParse([{ id: "x", phase: "ZZZ", requiresStabilization: false }]).success,
    ).toBe(false);
  });

  it("round-trip d'un état sérialisé (JSON) sans perte", () => {
    let state = initDayState(plan);
    state = transition(state, { type: "START_STEP", at: 0 }).state; // init → jalon
    state = transition(state, { type: "VALIDATE_STEP", at: 0 }).state;
    state = transition(state, { type: "START_STEP", at: 1_000 }).state; // mash-1
    state = transition(state, {
      type: "CONFIRM_STABILIZATION",
      at: 2_000,
      temperatureC: 66,
      source: "manual",
    }).state;
    state = transition(state, {
      type: "RECORD_MEASUREMENT",
      at: 3_000,
      kind: "density",
      value: 1.05,
    }).state;

    const serialized = JSON.parse(JSON.stringify(state));
    const reparsed = dayStateSchema.parse(serialized);
    expect(reparsed).toEqual(state);
    expect(reparsed.timer?.stepId).toBe("mash-1");
    expect(reparsed.measurements).toHaveLength(2); // température (stabilisation) + densité
  });

  it("rejette un état au statut hors énumération", () => {
    const bad = { ...initDayState(plan), status: "BOGUS" };
    expect(dayStateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("M9-03 — le round-trip JSONB ne perd aucun champ du plan", () => {
  it("conserve `targetTempConstraint` (sinon le refroidissement régresse au rechargement)", () => {
    const step = {
      id: "cooling-1",
      phase: "COOLING" as const,
      label: "Refroidissement",
      requiresStabilization: true,
      targetTempC: 20,
      targetTempConstraint: "at_most" as const,
      requiredMeasurements: ["temperature" as const],
    };
    const parsed = dayPlanSchema.parse(JSON.parse(JSON.stringify([step])));
    // Zod retire par défaut les clés inconnues : un champ oublié ici
    // disparaîtrait en silence à la première reprise de session.
    expect(parsed[0]).toEqual(step);
  });

  it("accepte la phase WHIRLPOOL (M9-03)", () => {
    const plan = [{ id: "whirlpool-1", phase: "WHIRLPOOL", requiresStabilization: false }];
    expect(dayPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("conserve `hopAdditions` (M9-04 — sinon les alertes de houblonnage régressent au rechargement)", () => {
    const step = {
      id: "boil-1",
      phase: "BOIL" as const,
      requiresStabilization: true,
      plannedHoldMin: 60,
      hopAdditions: [
        {
          name: "Magnum",
          amountG: 20,
          nature: "BITTERING" as const,
          remainingMin: 60,
          offsetFromStartMin: 0,
          inconsistent: false,
        },
        {
          name: "Citra",
          amountG: 30,
          nature: "FLAME_OUT" as const,
          remainingMin: 0,
          offsetFromStartMin: 60,
          inconsistent: false,
        },
      ],
    };
    const parsed = dayPlanSchema.parse(JSON.parse(JSON.stringify([step])));
    expect(parsed[0]).toEqual(step);
  });

  it("rejette une nature d'ajout de houblon inconnue", () => {
    const plan = [
      {
        id: "boil-1",
        phase: "BOIL",
        requiresStabilization: true,
        hopAdditions: [
          {
            name: "Magnum",
            amountG: 20,
            nature: "DRY_HOP",
            remainingMin: 60,
            offsetFromStartMin: 0,
            inconsistent: false,
          },
        ],
      },
    ];
    expect(dayPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("rejette une valeur de contrainte inconnue", () => {
    const plan = [
      {
        id: "x",
        phase: "COOLING",
        requiresStabilization: false,
        targetTempConstraint: "exactly",
      },
    ];
    expect(dayPlanSchema.safeParse(plan).success).toBe(false);
  });
});
