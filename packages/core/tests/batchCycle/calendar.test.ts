import { describe, expect, it } from "vitest";

import { addCalendarDays, calendarDateInZone } from "../../src/batchCycle/calendar.js";

const PARIS = "Europe/Paris";
const NEW_YORK = "America/New_York";
const TOKYO = "Asia/Tokyo";
const UTC = "UTC";

const at = (iso: string): number => new Date(iso).getTime();

describe("calendarDateInZone — date calendaire locale d'un instant", () => {
  it("rend la date du fuseau, pas celle d'UTC", () => {
    // 22:30 UTC = le lendemain 00:30 à Paris (heure d'hiver) ; la veille 17:30 à New York.
    const instant = at("2026-03-01T23:30:00Z");
    expect(calendarDateInZone(instant, UTC)).toBe("2026-03-01");
    expect(calendarDateInZone(instant, PARIS)).toBe("2026-03-02");
    expect(calendarDateInZone(instant, NEW_YORK)).toBe("2026-03-01");
    expect(calendarDateInZone(instant, TOKYO)).toBe("2026-03-02");
  });

  it("formate minuit comme 00, jamais 24 (piège du cycle horaire par défaut)", () => {
    expect(calendarDateInZone(at("2026-03-01T23:00:00Z"), PARIS)).toBe("2026-03-02");
  });

  it("zéro-pad le mois et le jour", () => {
    expect(calendarDateInZone(at("2026-01-05T12:00:00Z"), UTC)).toBe("2026-01-05");
  });
});

describe("addCalendarDays — arithmétique calendaire", () => {
  it("ajoute des jours calendaires en préservant l'heure locale", () => {
    const start = at("2026-03-01T12:00:00Z");
    expect(calendarDateInZone(addCalendarDays(start, 14, UTC), UTC)).toBe("2026-03-15");
    expect(new Date(addCalendarDays(start, 14, UTC)).toISOString()).toBe(
      "2026-03-15T12:00:00.000Z",
    );
  });

  it("traverse un passage à l'heure d'été sans dériver (Paris, 29 mars 2026)", () => {
    const before = new Date("2026-03-28T10:00:00+01:00").getTime();
    const after = addCalendarDays(before, 2, PARIS);
    expect(calendarDateInZone(after, PARIS)).toBe("2026-03-30");
    // Même heure locale (10:00) malgré le décalage UTC+1 → UTC+2.
    expect(new Date(after).toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });

  it("traverse un passage à l'heure d'hiver sans dériver (Paris, 25 octobre 2026)", () => {
    const before = new Date("2026-10-24T10:00:00+02:00").getTime();
    const after = addCalendarDays(before, 2, PARIS);
    expect(calendarDateInZone(after, PARIS)).toBe("2026-10-26");
    expect(new Date(after).toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("gère les longueurs de mois, les années bissextiles et les changements d'année", () => {
    const cases: readonly [string, number, string][] = [
      ["2026-01-31T09:00:00Z", 1, "2026-02-01"],
      // 2028 est bissextile : le 29 février existe.
      ["2028-02-28T09:00:00Z", 1, "2028-02-29"],
      ["2026-02-28T09:00:00Z", 1, "2026-03-01"],
      ["2026-12-31T09:00:00Z", 1, "2027-01-01"],
      ["2026-01-01T09:00:00Z", 365, "2027-01-01"],
    ];
    for (const [start, days, expected] of cases) {
      expect(calendarDateInZone(addCalendarDays(at(start), days, UTC), UTC)).toBe(expected);
    }
  });

  it("ajouter 0 jour laisse l'instant inchangé", () => {
    const instant = at("2026-03-01T12:34:56.789Z");
    expect(addCalendarDays(instant, 0, PARIS)).toBe(instant);
  });

  it("préserve les millisecondes (elles ne dépendent d'aucun fuseau)", () => {
    const instant = at("2026-03-01T12:34:56.789Z");
    expect(new Date(addCalendarDays(instant, 3, PARIS)).toISOString()).toBe(
      "2026-03-04T12:34:56.789Z",
    );
  });

  it("fonctionne sur un fuseau à décalage non horaire (Inde, UTC+05:30)", () => {
    const instant = new Date("2026-03-01T23:45:00+05:30").getTime();
    const after = addCalendarDays(instant, 30, "Asia/Kolkata");
    expect(calendarDateInZone(after, "Asia/Kolkata")).toBe("2026-03-31");
  });

  it("fonctionne dans l'hémisphère sud, où le changement d'heure est inversé", () => {
    // Sydney recule d'une heure début avril (fin de l'heure d'été australienne).
    const before = new Date("2026-04-04T20:00:00+11:00").getTime();
    const after = addCalendarDays(before, 2, "Australia/Sydney");
    expect(calendarDateInZone(after, "Australia/Sydney")).toBe("2026-04-06");
    expect(new Date(after).toISOString()).toBe("2026-04-06T10:00:00.000Z");
  });

  it("un fuseau inconnu échoue explicitement plutôt que de retomber sur UTC", () => {
    expect(() => addCalendarDays(at("2026-03-01T12:00:00Z"), 1, "Mars/Olympus_Mons")).toThrow(
      RangeError,
    );
  });

  describe("heures locales ambiguës ou inexistantes (bords du changement d'heure)", () => {
    it("heure inexistante : renvoie un instant voisin cohérent, sans lever", () => {
      // À Paris le 29 mars 2026, 02:30 locale n'existe pas (2h → 3h).
      const before = new Date("2026-03-28T02:30:00+01:00").getTime();
      const after = addCalendarDays(before, 1, PARIS);
      // La date reste celle attendue — c'est ce qui compte pour un jalon.
      expect(calendarDateInZone(after, PARIS)).toBe("2026-03-29");
      expect(Number.isFinite(after)).toBe(true);
    });

    it("heure ambiguë : renvoie l'une des deux occurrences, sans lever", () => {
      // Le 25 octobre 2026, 02:30 locale survient deux fois à Paris.
      const before = new Date("2026-10-24T02:30:00+02:00").getTime();
      const after = addCalendarDays(before, 1, PARIS);
      expect(calendarDateInZone(after, PARIS)).toBe("2026-10-25");
      expect(Number.isFinite(after)).toBe(true);
    });
  });
});
