import { describe, expect, it } from "vitest";

import {
  consentInputSchema,
  memberCreateSchema,
  memberUpdateSchema,
} from "../../src/schemas/member.js";

describe("memberCreateSchema", () => {
  it("accepte une identité minimale valide (roles par défaut [])", () => {
    const parsed = memberCreateSchema.parse({
      memberNumber: "M-001",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(parsed.roles).toEqual([]);
    expect(parsed.email).toBeUndefined();
  });

  it("exige memberNumber, firstName et lastName non vides", () => {
    expect(memberCreateSchema.safeParse({ firstName: "Ada", lastName: "L" }).success).toBe(false);
    expect(
      memberCreateSchema.safeParse({ memberNumber: "M", firstName: "", lastName: "L" }).success,
    ).toBe(false);
  });

  it("rejette un email invalide, accepte un email valide + coerce birthDate", () => {
    expect(
      memberCreateSchema.safeParse({
        memberNumber: "M-002",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "pas-un-email",
      }).success,
    ).toBe(false);

    const ok = memberCreateSchema.parse({
      memberNumber: "M-003",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.org",
      birthDate: "1990-05-01",
      roles: ["ADHERENT", "TRESORIER"],
    });
    expect(ok.birthDate).toBeInstanceOf(Date);
    expect(ok.roles).toEqual(["ADHERENT", "TRESORIER"]);
  });

  it("rejette un rôle associatif inconnu", () => {
    expect(
      memberCreateSchema.safeParse({
        memberNumber: "M-004",
        firstName: "Ada",
        lastName: "Lovelace",
        roles: ["PRESIDENT"],
      }).success,
    ).toBe(false);
  });
});

describe("memberUpdateSchema", () => {
  it("accepte un patch partiel", () => {
    expect(memberUpdateSchema.parse({ phone: "0600000000" })).toEqual({ phone: "0600000000" });
  });

  it("rejette un patch vide (au moins un champ)", () => {
    expect(memberUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("ne connaît pas memberNumber (immuable) — champ ignoré au parse", () => {
    const parsed = memberUpdateSchema.parse({ firstName: "Grace", memberNumber: "M-999" });
    expect(parsed).toEqual({ firstName: "Grace" });
  });
});

describe("consentInputSchema", () => {
  it("accepte un événement de consentement valide", () => {
    expect(consentInputSchema.parse({ type: "PHOTOS", granted: true })).toEqual({
      type: "PHOTOS",
      granted: true,
    });
  });

  it("rejette un type inconnu ou un granted manquant", () => {
    expect(consentInputSchema.safeParse({ type: "SPAM", granted: true }).success).toBe(false);
    expect(consentInputSchema.safeParse({ type: "PHOTOS" }).success).toBe(false);
  });
});
