import { describe, expect, it } from "vitest";

import { addCalendarDays, calendarDateInZone } from "../../src/batchCycle/calendar.js";
import {
  type BatchMilestone,
  buildBatchMilestones,
  type CycleDurations,
  recipeHasDryHop,
} from "../../src/batchCycle/milestones.js";
import { buildBatchMilestonesInputSchema } from "../../src/schemas/batchCycle.js";

const PARIS = "Europe/Paris";

/** Instant d'une date-heure locale de Paris, sans dépendre du fuseau de la machine. */
const parisInstant = (iso: string, offset: "+01:00" | "+02:00"): number =>
  new Date(`${iso}${offset}`).getTime();

/** Durées de la série de référence de FORMULES §13.1 : 14 / 3 / 2 / 21 j. */
const REFERENCE_DURATIONS: CycleDurations = {
  fermentationDays: 14,
  dryHopDays: 3,
  coldCrashDays: 2,
  gardeDays: 21,
};

const endDates = (milestones: readonly BatchMilestone[]): Record<string, string> =>
  Object.fromEntries(milestones.map((m) => [m.kind, m.plannedEndDate]));

describe("buildBatchMilestones — valeurs de référence FORMULES §13.1", () => {
  // Le 2026-03-01 est en heure d'hiver à Paris (UTC+1).
  const pitchedAtMidnight = parisInstant("2026-03-01T00:00:00", "+01:00");

  it("ensemencement 2026-03-01, 14/3/2/21 j → fin de garde 2026-04-10 (cycle 40 j)", () => {
    const milestones = buildBatchMilestones({
      pitchedAt: pitchedAtMidnight,
      timezone: PARIS,
      durations: REFERENCE_DURATIONS,
      hasDryHop: true,
    });

    expect(milestones.map((m) => m.kind)).toEqual([
      "FERMENTATION",
      "DRY_HOP",
      "COLD_CRASH",
      "GARDE",
    ]);
    expect(endDates(milestones)).toEqual({
      FERMENTATION: "2026-03-15",
      DRY_HOP: "2026-03-18",
      COLD_CRASH: "2026-03-20",
      GARDE: "2026-04-10",
    });

    // Le cycle démarre à l'ensemencement et dure 40 jours calendaires.
    expect(milestones[0]?.plannedStartDate).toBe("2026-03-01");
    expect(milestones[0]?.plannedStartAt).toBe(pitchedAtMidnight);
    const totalDays = milestones.reduce((sum, m) => sum + m.plannedDurationDays, 0);
    expect(totalDays).toBe(40);
  });

  it("la même série sans dry hop → fin de garde 2026-04-07 (cycle 37 j), sans trou", () => {
    const milestones = buildBatchMilestones({
      pitchedAt: pitchedAtMidnight,
      timezone: PARIS,
      durations: REFERENCE_DURATIONS,
      hasDryHop: false,
    });

    expect(milestones.map((m) => m.kind)).toEqual(["FERMENTATION", "COLD_CRASH", "GARDE"]);
    expect(endDates(milestones)).toEqual({
      FERMENTATION: "2026-03-15",
      COLD_CRASH: "2026-03-17",
      GARDE: "2026-04-07",
    });
    // Sans trou : le cold crash démarre le jour où finit la fermentation.
    expect(milestones[1]?.plannedStartDate).toBe("2026-03-15");
    expect(milestones[1]?.plannedStartAt).toBe(milestones[0]?.plannedEndAt);
    expect(milestones.reduce((sum, m) => sum + m.plannedDurationDays, 0)).toBe(37);
  });

  it("chaînage : chaque phase démarre exactement à la fin de la précédente", () => {
    const milestones = buildBatchMilestones({
      pitchedAt: pitchedAtMidnight,
      timezone: PARIS,
      durations: REFERENCE_DURATIONS,
      hasDryHop: true,
    });
    for (const [i, m] of milestones.entries()) {
      expect(m.sortOrder).toBe(i);
      if (i > 0) expect(m.plannedStartAt).toBe(milestones[i - 1]?.plannedEndAt);
    }
  });
});

describe("buildBatchMilestones — changement d'heure (le piège de FORMULES §13.1)", () => {
  /**
   * L'heure d'été 2026 débute à Paris le dimanche 29 mars — soit **pendant** la
   * garde de la série de référence. Un ensemencement en fin de soirée rend le
   * piège mordant : une addition en `n × 86 400 000 ms` décalerait l'heure locale
   * d'une heure, ferait basculer 23:30 en 00:30 et donc la date au lendemain.
   */
  const pitchedLate = parisInstant("2026-03-01T23:30:00", "+01:00");

  it("un ensemencement à 23:30 retombe sur les mêmes dates calendaires", () => {
    const milestones = buildBatchMilestones({
      pitchedAt: pitchedLate,
      timezone: PARIS,
      durations: REFERENCE_DURATIONS,
      hasDryHop: true,
    });
    expect(endDates(milestones)).toEqual({
      FERMENTATION: "2026-03-15",
      DRY_HOP: "2026-03-18",
      COLD_CRASH: "2026-03-20",
      GARDE: "2026-04-10",
    });
  });

  it("l'addition naïve en millisecondes, elle, se décale d'un jour", () => {
    // Garde-fou du garde-fou : si ce test venait à passer avec l'implémentation
    // naïve, c'est que le cas de référence ne verrouille plus rien.
    const naive = pitchedLate + 40 * 24 * 60 * 60 * 1000;
    expect(calendarDateInZone(naive, PARIS)).toBe("2026-04-11");
    expect(addCalendarDays(pitchedLate, 40, PARIS)).not.toBe(naive);
    expect(calendarDateInZone(addCalendarDays(pitchedLate, 40, PARIS), PARIS)).toBe("2026-04-10");
  });

  it("l'heure locale est préservée à travers le changement d'heure", () => {
    const end = addCalendarDays(pitchedLate, 40, PARIS);
    // 23:30 locale au départ (UTC+1) → 23:30 locale à l'arrivée (UTC+2).
    expect(new Date(end).toISOString()).toBe("2026-04-10T21:30:00.000Z");
  });
});

describe("buildBatchMilestones — durée nulle : la phase est supprimée", () => {
  const pitchedAt = parisInstant("2026-03-01T00:00:00", "+01:00");
  const build = (durations: CycleDurations, hasDryHop = true): readonly BatchMilestone[] =>
    buildBatchMilestones({ pitchedAt, timezone: PARIS, durations, hasDryHop });

  it("une durée à 0 ne produit pas un jalon de durée zéro : la phase disparaît", () => {
    const milestones = build({ ...REFERENCE_DURATIONS, coldCrashDays: 0 });
    expect(milestones.map((m) => m.kind)).toEqual(["FERMENTATION", "DRY_HOP", "GARDE"]);
    // La séquence se referme sans trou et `sortOrder` reste contigu.
    expect(milestones.map((m) => m.sortOrder)).toEqual([0, 1, 2]);
    expect(endDates(milestones).GARDE).toBe("2026-04-08");
  });

  it("dry hop déclaré mais de durée nulle → phase absente malgré `hasDryHop`", () => {
    const milestones = build({ ...REFERENCE_DURATIONS, dryHopDays: 0 });
    expect(milestones.map((m) => m.kind)).toEqual(["FERMENTATION", "COLD_CRASH", "GARDE"]);
    expect(endDates(milestones).GARDE).toBe("2026-04-07");
  });

  it("toutes les durées nulles → aucun jalon, pas d'erreur", () => {
    expect(build({ fermentationDays: 0, dryHopDays: 0, coldCrashDays: 0, gardeDays: 0 })).toEqual(
      [],
    );
  });

  it("seule la garde renseignée → un unique jalon démarrant à l'ensemencement", () => {
    const milestones = build(
      { fermentationDays: 0, dryHopDays: 0, coldCrashDays: 0, gardeDays: 21 },
      false,
    );
    expect(milestones).toHaveLength(1);
    expect(milestones[0]).toMatchObject({
      kind: "GARDE",
      sortOrder: 0,
      plannedStartDate: "2026-03-01",
      plannedEndDate: "2026-03-22",
    });
  });
});

describe("buildBatchMilestonesInputSchema — bornes des durées (ADR-04)", () => {
  const input = (durations: Partial<CycleDurations>): unknown => ({
    pitchedAt: 1_772_326_800_000,
    timezone: PARIS,
    durations: { ...REFERENCE_DURATIONS, ...durations },
    hasDryHop: true,
  });

  it("accepte les bornes 0 et 365", () => {
    expect(buildBatchMilestonesInputSchema.safeParse(input({ gardeDays: 0 })).success).toBe(true);
    expect(buildBatchMilestonesInputSchema.safeParse(input({ gardeDays: 365 })).success).toBe(true);
  });

  it("rejette hors bornes plutôt que d'écrêter en silence", () => {
    expect(buildBatchMilestonesInputSchema.safeParse(input({ gardeDays: 366 })).success).toBe(
      false,
    );
    expect(buildBatchMilestonesInputSchema.safeParse(input({ gardeDays: -1 })).success).toBe(false);
  });

  it("rejette une durée non entière", () => {
    expect(buildBatchMilestonesInputSchema.safeParse(input({ gardeDays: 21.5 })).success).toBe(
      false,
    );
  });

  it("rejette un fuseau vide, un instant négatif ou non entier, un `hasDryHop` absent", () => {
    const base = input({}) as Record<string, unknown>;
    expect(buildBatchMilestonesInputSchema.safeParse({ ...base, timezone: "" }).success).toBe(
      false,
    );
    expect(buildBatchMilestonesInputSchema.safeParse({ ...base, pitchedAt: -1 }).success).toBe(
      false,
    );
    expect(buildBatchMilestonesInputSchema.safeParse({ ...base, pitchedAt: 1.5 }).success).toBe(
      false,
    );
    const { hasDryHop: _omitted, ...withoutFlag } = base;
    expect(buildBatchMilestonesInputSchema.safeParse(withoutFlag).success).toBe(false);
  });

  it("une entrée validée est directement consommable par `buildBatchMilestones`", () => {
    const parsed = buildBatchMilestonesInputSchema.parse(input({}));
    expect(buildBatchMilestones(parsed)).toHaveLength(4);
  });
});

describe("recipeHasDryHop — détection depuis le recipeSnapshot", () => {
  const snapshotOf = (ingredients: unknown): unknown => ({ id: "r1", steps: [], ingredients });
  const ingredient = (category: string, use: string): unknown => ({
    category,
    name: "Citra",
    amount: 50,
    use,
  });

  it("vrai si un houblon est employé en DRY_HOP", () => {
    expect(
      recipeHasDryHop(snapshotOf([ingredient("MALT", "MASH"), ingredient("HOP", "DRY_HOP")])),
    ).toBe(true);
  });

  it("faux si les houblons ne sont employés qu'en ébullition", () => {
    expect(
      recipeHasDryHop(snapshotOf([ingredient("HOP", "BOIL"), ingredient("HOP", "WHIRLPOOL")])),
    ).toBe(false);
  });

  it("faux pour un ingrédient non-houblon employé en DRY_HOP", () => {
    expect(recipeHasDryHop(snapshotOf([ingredient("ADJUNCT", "DRY_HOP")]))).toBe(false);
  });

  it("faux sans houblon, sans ingrédient, ou sur un snapshot pré-M9", () => {
    expect(recipeHasDryHop(snapshotOf([ingredient("MALT", "MASH")]))).toBe(false);
    expect(recipeHasDryHop(snapshotOf([]))).toBe(false);
    expect(recipeHasDryHop({ id: "r1", steps: [] })).toBe(false);
  });

  it("faux sur un snapshot absent ou corrompu, jamais d'exception", () => {
    for (const snapshot of [
      null,
      undefined,
      "oops",
      42,
      snapshotOf("nope"),
      snapshotOf([null, "bogus", 7, { name: "sans catégorie" }]),
    ]) {
      expect(recipeHasDryHop(snapshot)).toBe(false);
    }
  });
});
