import { describe, expect, it } from "vitest";

import {
  CONTRIBUTION_CSV_COLUMNS,
  contributionCsvRow,
  type CsvColumn,
  MOVEMENT_CSV_COLUMNS,
  movementCsvRow,
  SALE_CSV_COLUMNS,
  saleCsvRow,
  toCsv,
} from "../../src/hub/csv.js";

const columns: CsvColumn[] = [
  { key: "a", header: "col_a" },
  { key: "b", header: "col_b" },
];

describe("toCsv", () => {
  it("écrit l'en-tête puis les lignes, séparées par CRLF", () => {
    const csv = toCsv([{ a: "1", b: "2" }], columns);
    expect(csv).toBe("col_a,col_b\r\n1,2");
  });

  it("échappe virgule, guillemet et retour ligne (RFC 4180)", () => {
    const csv = toCsv([{ a: "contient, virgule", b: 'guillemet " et\nretour' }], columns);
    expect(csv).toBe('col_a,col_b\r\n"contient, virgule","guillemet "" et\nretour"');
  });

  it("rend un champ vide pour une clé absente de la ligne", () => {
    expect(toCsv([{ a: "x" }], columns)).toBe("col_a,col_b\r\nx,");
  });

  it("sans lignes → en-tête seul", () => {
    expect(toCsv([], columns)).toBe("col_a,col_b");
  });
});

describe("saleCsvRow", () => {
  it("formate le montant en euros et la date en ISO", () => {
    const row = saleCsvRow({
      occurredAt: new Date("2026-07-03T18:30:00Z"),
      amountCents: 450,
      currency: "EUR",
      paymentMethod: "card",
      itemLabel: "IPA 33cl",
      externalId: "tx_1",
    });
    expect(row).toEqual({
      date: "2026-07-03T18:30:00.000Z",
      montant: "4.50",
      devise: "EUR",
      moyenPaiement: "card",
      produit: "IPA 33cl",
      reference: "tx_1",
    });
  });

  it("champs optionnels absents → chaînes vides ; intégrable via toCsv", () => {
    const row = saleCsvRow({
      occurredAt: new Date("2026-07-03T18:30:00Z"),
      amountCents: 0,
      currency: "EUR",
      externalId: "tx_2",
    });
    expect(row.moyenPaiement).toBe("");
    expect(row.produit).toBe("");
    const csv = toCsv([row], SALE_CSV_COLUMNS);
    expect(csv.split("\r\n")[0]).toBe(
      "date,montant_eur,devise,moyen_paiement,produit,reference_externe",
    );
    expect(csv.split("\r\n")[1]).toBe("2026-07-03T18:30:00.000Z,0.00,EUR,,,tx_2");
  });
});

describe("contributionCsvRow", () => {
  it("projette une cotisation, membre/référence optionnels", () => {
    const row = contributionCsvRow({
      occurredAt: new Date("2026-07-01T00:00:00Z"),
      amountCents: 2500,
      currency: "EUR",
      memberLabel: "M-0007",
    });
    expect(row).toMatchObject({ montant: "25.00", membre: "M-0007", reference: "" });
    expect(toCsv([row], CONTRIBUTION_CSV_COLUMNS).split("\r\n")[0]).toBe(
      "date,montant_eur,devise,membre,reference",
    );
  });

  it("membre absent, référence présente → membre vide, référence remplie", () => {
    const row = contributionCsvRow({
      occurredAt: new Date("2026-07-01T00:00:00Z"),
      amountCents: 2500,
      currency: "EUR",
      reference: "helloasso_42",
    });
    expect(row.membre).toBe("");
    expect(row.reference).toBe("helloasso_42");
  });
});

describe("movementCsvRow", () => {
  it("delta en unité interne (pas un montant), dépense en euros si présente", () => {
    const row = movementCsvRow({
      occurredAt: new Date("2026-07-02T00:00:00Z"),
      articleLabel: "Malt Pale",
      delta: -1500,
      reason: "SALE",
      amountCents: 1290,
      note: "vente comptoir",
    });
    expect(row).toMatchObject({
      article: "Malt Pale",
      quantite: "-1500",
      motif: "SALE",
      montant: "12.90",
      note: "vente comptoir",
    });
  });

  it("sans montant ni note → chaînes vides", () => {
    const row = movementCsvRow({
      occurredAt: new Date("2026-07-02T00:00:00Z"),
      articleLabel: "Houblon",
      delta: 200,
      reason: "PURCHASE",
    });
    expect(row.montant).toBe("");
    expect(row.note).toBe("");
    expect(toCsv([row], MOVEMENT_CSV_COLUMNS).split("\r\n")[0]).toBe(
      "date,article,quantite,motif,montant_eur,note",
    );
  });
});
