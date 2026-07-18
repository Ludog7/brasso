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

  describe("fuseau dont le changement d'heure tombe à minuit (#255)", () => {
    /**
     * Santiago avance ses horloges **à minuit** : l'heure locale juste après
     * minuit n'existe pas ce jour-là. Résoudre en **reculant** traverserait alors
     * la frontière de date et daterait le jalon de la veille — le bug #255. La
     * désambiguïsation doit avancer après le saut, pas reculer avant.
     */
    const SANTIAGO = "America/Santiago";

    it("le 1972-10-15, minuit saute à 01:00 : +11 jours reste le 15, pas le 14", () => {
      const start = at("1972-10-04T04:17:00Z"); // 00:17 locale à Santiago
      expect(calendarDateInZone(start, SANTIAGO)).toBe("1972-10-04");
      expect(calendarDateInZone(addCalendarDays(start, 11, SANTIAGO), SANTIAGO)).toBe("1972-10-15");
    });

    it("second cas relevé : +177 jours depuis le 2045-03-10", () => {
      const start = at("2045-03-10T03:35:00Z");
      expect(calendarDateInZone(addCalendarDays(start, 177, SANTIAGO), SANTIAGO)).toBe(
        "2045-09-03",
      );
    });

    it("l'heure inexistante est repoussée après le saut, jamais avant", () => {
      const start = at("1972-10-04T04:17:00Z");
      const end = addCalendarDays(start, 11, SANTIAGO);
      // 00:17 n'existant pas le 15, on retombe sur 01:17 — après le saut.
      expect(new Date(end).toISOString()).toBe("1972-10-15T04:17:00.000Z");
    });

    /**
     * Symétrique du précédent, et le piège de la correction : ici l'heure locale
     * demandée est **parfaitement valide**, mais la sonde initiale tombe de
     * l'autre côté d'une transition proche. Avancer systématiquement ferait
     * gagner un jour au jalon. Sydney sort de l'heure d'été le 2026-04-05.
     */
    it("heure locale valide près d'une transition : la date n'avance pas indûment", () => {
      const SYDNEY = "Australia/Sydney";
      const start = at("2026-04-03T12:30:00Z"); // 23:30 locale le 3 avril
      expect(calendarDateInZone(start, SYDNEY)).toBe("2026-04-03");
      expect(calendarDateInZone(addCalendarDays(start, 1, SYDNEY), SYDNEY)).toBe("2026-04-04");
      expect(calendarDateInZone(addCalendarDays(start, 365, SYDNEY), SYDNEY)).toBe("2027-04-03");
    });
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

    it("heure ambiguë : les deux occurrences portent la même date, le choix est neutre", () => {
      // Le 25 octobre 2026, 02:30 locale survient deux fois à Paris : en UTC+2
      // (00:30Z) puis en UTC+1 (01:30Z). Quelle que soit celle retenue, la date
      // est la même — c'est la définition de l'ambiguïté.
      const before = new Date("2026-10-24T02:30:00+02:00").getTime();
      const after = addCalendarDays(before, 1, PARIS);
      expect(calendarDateInZone(after, PARIS)).toBe("2026-10-25");
      expect(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]).toContain(
        new Date(after).toISOString(),
      );
    });

    it("un jour supprimé du calendrier : on avance au jour suivant existant", () => {
      // Kiritimati a franchi la ligne de changement de date fin 1994 : le
      // 1994-12-31 n'y a jamais existé. Viser cette date doit donner le 1995-01-01.
      const start = at("1994-12-24T22:00:00Z");
      const end = addCalendarDays(start, 7, "Pacific/Kiritimati");
      expect(calendarDateInZone(end, "Pacific/Kiritimati")).toBe("1995-01-01");
    });
  });
});
