import { describe, expect, it } from "vitest";

import {
  anonymizeMember,
  buildMemberExport,
  type ConsentEvent,
  deriveMembershipStatus,
  normalizeMatchKey,
  resolveConsents,
} from "../../src/members/index.js";

const DAY = 24 * 60 * 60 * 1000;

describe("deriveMembershipStatus", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("A_JOUR quand la dernière cotisation est dans la période", () => {
    const last = new Date(now.getTime() - 100 * DAY);
    expect(deriveMembershipStatus(last, 365, now)).toBe("A_JOUR");
  });

  it("EN_RETARD au-delà de la période", () => {
    const last = new Date(now.getTime() - 400 * DAY);
    expect(deriveMembershipStatus(last, 365, now)).toBe("EN_RETARD");
  });

  it("EN_RETARD si aucune cotisation connue (null)", () => {
    expect(deriveMembershipStatus(null, 365, now)).toBe("EN_RETARD");
  });

  it("borne haute incluse : now == last + period → A_JOUR", () => {
    const last = new Date(now.getTime() - 365 * DAY);
    expect(deriveMembershipStatus(last, 365, now)).toBe("A_JOUR");
    const past = new Date(now.getTime() - 365 * DAY - 1);
    expect(deriveMembershipStatus(past, 365, now)).toBe("EN_RETARD");
  });

  it("RangeError si periodDays ≤ 0 ou non fini", () => {
    const last = new Date(now.getTime() - DAY);
    expect(() => deriveMembershipStatus(last, 0, now)).toThrow(RangeError);
    expect(() => deriveMembershipStatus(last, -5, now)).toThrow(RangeError);
    expect(() => deriveMembershipStatus(last, Number.NaN, now)).toThrow(RangeError);
  });

  it("RangeError si lastContributionAt est une date invalide", () => {
    expect(() => deriveMembershipStatus(new Date("nope"), 365, now)).toThrow(RangeError);
  });
});

describe("resolveConsents", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const t1 = new Date("2026-02-01T00:00:00Z");
  const t2 = new Date("2026-03-01T00:00:00Z");

  it("historique vide → tous les types undefined", () => {
    const r = resolveConsents([]);
    expect(r.COMMUNICATION).toBeUndefined();
    expect(r.PHOTOS).toBeUndefined();
    expect(r.NOTIFICATIONS_LEGALES).toBeUndefined();
  });

  it("retient le dernier événement par type (octroi puis retrait)", () => {
    const events: ConsentEvent[] = [
      { type: "COMMUNICATION", granted: true, at: t0 },
      { type: "COMMUNICATION", granted: false, at: t2 },
      { type: "PHOTOS", granted: true, at: t1 },
    ];
    const r = resolveConsents(events);
    expect(r.COMMUNICATION).toEqual({ granted: false, at: t2 });
    expect(r.PHOTOS).toEqual({ granted: true, at: t1 });
    expect(r.NOTIFICATIONS_LEGALES).toBeUndefined();
  });

  it("égalité de date → le dernier de la liste l'emporte", () => {
    const events: ConsentEvent[] = [
      { type: "PHOTOS", granted: true, at: t1 },
      { type: "PHOTOS", granted: false, at: t1 },
    ];
    expect(resolveConsents(events).PHOTOS).toEqual({ granted: false, at: t1 });
  });

  it("l'ordre d'arrivée n'affecte pas le résultat (date max gagne)", () => {
    const events: ConsentEvent[] = [
      { type: "COMMUNICATION", granted: false, at: t2 },
      { type: "COMMUNICATION", granted: true, at: t0 },
    ];
    expect(resolveConsents(events).COMMUNICATION).toEqual({ granted: false, at: t2 });
  });
});

describe("anonymizeMember", () => {
  it("efface toute PII et pose une identité neutre", () => {
    expect(anonymizeMember()).toEqual({
      firstName: "Membre",
      lastName: "anonymisé",
      email: null,
      phone: null,
      address: null,
      birthDate: null,
    });
  });

  it("est déterministe", () => {
    expect(anonymizeMember()).toEqual(anonymizeMember());
  });
});

describe("buildMemberExport", () => {
  it("assemble le dossier : identité, consentements résolus + historique trié, agrégats", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-02-01T00:00:00Z");
    const dossier = buildMemberExport({
      member: {
        memberNumber: "M-001",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.org",
        phone: null,
        address: null,
        birthDate: null,
        membership: "A_JOUR",
      },
      consents: [
        { type: "COMMUNICATION", granted: false, at: t1 },
        { type: "COMMUNICATION", granted: true, at: t0 },
      ],
      contributions: [{ amountCents: 2500, currency: "EUR", occurredAt: t0, reference: "HA-1" }],
      auditTrail: [{ action: "MEMBER_READ", at: t1, resourceType: "member" }],
    });

    expect(dossier.schemaVersion).toBe(1);
    expect(dossier.member.memberNumber).toBe("M-001");
    // Historique trié du plus ancien au plus récent.
    expect(dossier.consents.history.map((e) => e.at)).toEqual([t0, t1]);
    // Courant = dernier événement (retrait à t1).
    expect(dossier.consents.current.COMMUNICATION).toEqual({ granted: false, at: t1 });
    expect(dossier.contributions).toHaveLength(1);
    expect(dossier.auditTrail[0]?.action).toBe("MEMBER_READ");
  });
});

describe("normalizeMatchKey", () => {
  it("supprime les accents, met en minuscule, réduit les espaces", () => {
    expect(normalizeMatchKey("  Ada  LOVELACE  ")).toBe("ada lovelace");
    expect(normalizeMatchKey("Café Crème")).toBe("cafe creme");
    expect(normalizeMatchKey("JEAN.dûpont@Éxample.ORG")).toBe("jean.dupont@example.org");
  });

  it('chaîne vide → ""', () => {
    expect(normalizeMatchKey("")).toBe("");
    expect(normalizeMatchKey("   ")).toBe("");
  });
});
