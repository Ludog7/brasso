import { describe, expect, it } from "vitest";

import { calendarDateInZone } from "../../src/batchCycle/calendar.js";
import {
  checkCarbonation,
  type ConditioningDelays,
  saleAvailability,
  targetCarbonationPressureBar,
} from "../../src/batchCycle/conditioning.js";
import { kegPressurePsi } from "../../src/formulas/carbonation.js";
import { psiToBar } from "../../src/units.js";

const PARIS = "Europe/Paris";
const DELAYS: ConditioningDelays = { refermentationDays: 21, forcedCarbonationDays: 7 };
const at = (iso: string): number => new Date(iso).getTime();

describe("targetCarbonationPressureBar — pression cible en unité interne (FORMULES §8.2)", () => {
  it("reprend `kegPressurePsi` et convertit par `units.ts`, sans formule nouvelle", () => {
    // 2,4 volumes à 4 °C : la valeur doit être exactement celle de §8.2, en bar.
    const expected = psiToBar(kegPressurePsi(2.4, 4));
    expect(targetCarbonationPressureBar(2.4, 4)).toBeCloseTo(expected, 12);
  });

  it("ordre de grandeur d'un fût de bière : ~1 bar à 4 °C pour 2,4 volumes", () => {
    const bar = targetCarbonationPressureBar(2.4, 4);
    expect(bar).toBeGreaterThan(0.7);
    expect(bar).toBeLessThan(1.5);
  });

  it("plus la bière est chaude, plus il faut pousser pour le même CO₂", () => {
    const cold = targetCarbonationPressureBar(2.4, 2);
    const warm = targetCarbonationPressureBar(2.4, 12);
    expect(warm).toBeGreaterThan(cold);
  });

  it("plus le CO₂ visé est élevé, plus la pression cible monte", () => {
    expect(targetCarbonationPressureBar(3.0, 4)).toBeGreaterThan(
      targetCarbonationPressureBar(2.0, 4),
    );
  });

  it("une cible déjà atteinte ne demande aucune pression (jamais de valeur négative)", () => {
    // Une bière très froide contient déjà beaucoup de CO₂ : viser peu de volumes
    // donnerait une pression négative, dépourvue de sens physique.
    expect(targetCarbonationPressureBar(0.5, 0)).toBe(0);
  });

  it("l'altitude augmente la pression à régler", () => {
    expect(targetCarbonationPressureBar(2.4, 4, 3000)).toBeGreaterThan(
      targetCarbonationPressureBar(2.4, 4, 0),
    );
  });
});

describe("checkCarbonation — conformité d'un relevé", () => {
  it("juge la cible à la température RELEVÉE, pas à une autre", () => {
    // Réglage correct pour 2,4 vol à 4 °C : ~0,744 bar. Si la bière est en fait
    // à 12 °C, il en faudrait ~1,254 — la même pression y laisse une bière
    // plate. C'est exactement l'erreur que le recalcul à la température relevée
    // empêche de valider.
    const pressureFor4C = targetCarbonationPressureBar(2.4, 4);

    const at4 = checkCarbonation(2.4, pressureFor4C, 4, 0.2);
    expect(at4.onTarget).toBe(true);

    const at12 = checkCarbonation(2.4, pressureFor4C, 12, 0.2);
    expect(at12.targetBar).toBeCloseTo(targetCarbonationPressureBar(2.4, 12), 12);
    expect(at12.onTarget).toBe(false);
    expect(at12.deltaBar).toBeLessThan(0); // sous-carbonatée
  });

  it("accepte un relevé dans la tolérance, de part et d'autre", () => {
    const target = targetCarbonationPressureBar(2.4, 4);
    expect(checkCarbonation(2.4, target + 0.15, 4, 0.2).onTarget).toBe(true);
    expect(checkCarbonation(2.4, target - 0.15, 4, 0.2).onTarget).toBe(true);
    // À la borne exacte, on accepte.
    expect(checkCarbonation(2.4, target + 0.2, 4, 0.2).onTarget).toBe(true);
  });

  it("refuse au-delà de la tolérance", () => {
    const target = targetCarbonationPressureBar(2.4, 4);
    expect(checkCarbonation(2.4, target + 0.5, 4, 0.2).onTarget).toBe(false);
    expect(checkCarbonation(2.4, target - 0.5, 4, 0.2).onTarget).toBe(false);
  });

  it("une tolérance saisie négative est prise en valeur absolue", () => {
    const target = targetCarbonationPressureBar(2.4, 4);
    expect(checkCarbonation(2.4, target + 0.1, 4, -0.2).onTarget).toBe(true);
  });

  it("l'écart signé dit dans quel sens corriger", () => {
    const target = targetCarbonationPressureBar(2.4, 4);
    expect(checkCarbonation(2.4, target + 0.5, 4, 0.2).deltaBar).toBeCloseTo(0.5, 6);
    expect(checkCarbonation(2.4, target - 0.5, 4, 0.2).deltaBar).toBeCloseTo(-0.5, 6);
  });
});

describe("saleAvailability — date estimée de mise en vente", () => {
  const packagedAt = at("2026-04-10T10:00:00Z");

  it("refermentation en bouteille : 21 jours depuis le conditionnement", () => {
    const result = saleAvailability({
      method: "REFERMENTATION",
      packagedAt,
      delays: DELAYS,
      timezone: PARIS,
    });
    expect(result.availableDate).toBe("2026-05-01");
    expect(result.pendingReason).toBeNull();
  });

  it("carbonatation forcée : 7 jours depuis le relevé conforme, pas depuis la mise en fût", () => {
    const result = saleAvailability({
      method: "FORCED_CARBONATION",
      packagedAt,
      // Relevé conforme trois jours après la mise en fût.
      carbonationValidatedAt: at("2026-04-13T09:00:00Z"),
      delays: DELAYS,
      timezone: PARIS,
    });
    // 13 avril + 7 j = 20 avril, et non 10 + 7 = 17.
    expect(result.availableDate).toBe("2026-04-20");
  });

  it("carbonatation forcée sans relevé conforme : aucune date, et on dit pourquoi", () => {
    for (const validated of [null, undefined, Number.NaN]) {
      const result = saleAvailability({
        method: "FORCED_CARBONATION",
        packagedAt,
        carbonationValidatedAt: validated,
        delays: DELAYS,
        timezone: PARIS,
      });
      // Dater depuis la mise en fût promettrait une bière prête alors qu'elle
      // peut être restée plate.
      expect(result.availableAt).toBeNull();
      expect(result.pendingReason).toMatch(/relevé de pression/i);
    }
  });

  it("aucune méthode déclarée : aucune date de mise en vente", () => {
    const result = saleAvailability({
      method: "NONE",
      packagedAt,
      delays: DELAYS,
      timezone: PARIS,
    });
    expect(result.availableAt).toBeNull();
    expect(result.pendingReason).toMatch(/aucune mise en condition/i);
  });

  it("les délais viennent des Settings, jamais de core", () => {
    const result = saleAvailability({
      method: "REFERMENTATION",
      packagedAt,
      delays: { refermentationDays: 30, forcedCarbonationDays: 7 },
      timezone: PARIS,
    });
    expect(result.availableDate).toBe("2026-05-10");
  });

  it("un délai nul rend la ligne disponible dès son point de départ", () => {
    const result = saleAvailability({
      method: "REFERMENTATION",
      packagedAt,
      delays: { refermentationDays: 0, forcedCarbonationDays: 0 },
      timezone: PARIS,
    });
    expect(result.availableAt).toBe(packagedAt);
  });

  it("un délai négatif ou fractionnaire ne recule jamais la date", () => {
    const negative = saleAvailability({
      method: "REFERMENTATION",
      packagedAt,
      delays: { refermentationDays: -5, forcedCarbonationDays: 7 },
      timezone: PARIS,
    });
    expect(negative.availableAt).toBe(packagedAt);

    const fractional = saleAvailability({
      method: "REFERMENTATION",
      packagedAt,
      delays: { refermentationDays: 21.9, forcedCarbonationDays: 7 },
      timezone: PARIS,
    });
    expect(fractional.availableDate).toBe("2026-05-01");
  });

  it("le délai se compte en jours calendaires, y compris à travers un changement d'heure", () => {
    // Conditionné le 20 mars 2026 à 23:30 heure de Paris ; l'heure d'été débute
    // le 29 mars, donc en plein milieu des 21 jours de refermentation.
    const lateEvening = new Date("2026-03-20T23:30:00+01:00").getTime();
    const result = saleAvailability({
      method: "REFERMENTATION",
      packagedAt: lateEvening,
      delays: DELAYS,
      timezone: PARIS,
    });
    expect(result.availableDate).toBe("2026-04-10");
    // L'addition naïve en millisecondes basculerait au 11 avril : à l'arrivée
    // on est en UTC+2, donc 23:30 devient 00:30 le lendemain.
    const naive = lateEvening + 21 * 24 * 60 * 60 * 1000;
    expect(calendarDateInZone(naive, PARIS)).toBe("2026-04-11");
  });

  it("le fuseau de l'instance est respecté", () => {
    const result = saleAvailability({
      method: "REFERMENTATION",
      packagedAt: at("2026-04-10T23:30:00Z"),
      delays: DELAYS,
      timezone: "Pacific/Auckland",
    });
    // 11 avril en heure d'Auckland (UTC+12) → +21 j = 2 mai.
    expect(result.availableDate).toBe("2026-05-02");
  });
});

describe("ADR-11 — wording d'aide à la décision", () => {
  it("le motif d'attente n'affirme jamais une conformité ni une sûreté", () => {
    const pending = saleAvailability({
      method: "FORCED_CARBONATION",
      packagedAt: at("2026-04-10T10:00:00Z"),
      delays: DELAYS,
      timezone: PARIS,
    }).pendingReason;

    expect(pending).not.toMatch(/\bconforme\b/i);
    expect(pending).not.toMatch(/\bsûre?\b/i);
    expect(pending).not.toMatch(/stéril/i);
  });
});
