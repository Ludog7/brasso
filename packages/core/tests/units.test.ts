import { describe, expect, it } from "vitest";

import {
  ABV_FACTOR,
  BAR_PER_PSI,
  barToPsi,
  brixToPlato,
  cToF,
  DEFAULT_EFFICIENCY,
  DEFAULT_MASH_RATIO,
  ebcToSrm,
  fToC,
  galToL,
  GRAIN_ABSORPTION,
  GRAMS_PER_POUND,
  gToKg,
  gToLb,
  kgToG,
  lbToG,
  LITERS_PER_GALLON,
  lovibondToSrm,
  lToGal,
  MASH_HEAT_RATIO,
  platoToBrix,
  platoToSg,
  points,
  PRIMING_SUCROSE,
  psiToBar,
  sgFromPoints,
  sgToPlato,
  srmToEbc,
  srmToLovibond,
  WCF_DEFAULT,
} from "../src/units.js";

// Tolérances : exact pour les conversions linéaires, approché pour les polynômes.
const EXACT = 10;

describe("constantes de référence (Annexe B)", () => {
  it("figent les valeurs du référentiel", () => {
    expect(WCF_DEFAULT).toBe(1.04);
    expect(ABV_FACTOR).toBe(131.25);
    expect(PRIMING_SUCROSE).toBe(3.9);
    expect(MASH_HEAT_RATIO).toBe(0.41);
    expect(DEFAULT_EFFICIENCY).toBe(72);
    expect(DEFAULT_MASH_RATIO).toBe(3.0);
    expect(GRAIN_ABSORPTION).toBe(1.0);
  });

  it("figent les facteurs de conversion", () => {
    expect(GRAMS_PER_POUND).toBe(453.592);
    expect(LITERS_PER_GALLON).toBe(3.78541);
    expect(BAR_PER_PSI).toBe(0.0689476);
  });
});

describe("masse", () => {
  it("g ↔ kg (valeur connue + aller-retour)", () => {
    expect(gToKg(1000)).toBe(1);
    expect(kgToG(1)).toBe(1000);
    expect(kgToG(gToKg(2500))).toBeCloseTo(2500, EXACT);
  });

  it("g ↔ lb (1 lb = 453.592 g)", () => {
    expect(gToLb(453.592)).toBeCloseTo(1, EXACT);
    expect(lbToG(1)).toBeCloseTo(453.592, EXACT);
    expect(lbToG(gToLb(1000))).toBeCloseTo(1000, EXACT);
  });
});

describe("volume", () => {
  it("L ↔ gal US (1 gal = 3.78541 L)", () => {
    expect(lToGal(3.78541)).toBeCloseTo(1, EXACT);
    expect(galToL(1)).toBeCloseTo(3.78541, EXACT);
    expect(galToL(lToGal(20))).toBeCloseTo(20, EXACT);
  });
});

describe("température", () => {
  it("°C → °F sur points connus", () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(100)).toBe(212);
  });

  it("°F → °C sur points connus", () => {
    expect(fToC(32)).toBe(0);
    expect(fToC(212)).toBe(100);
  });

  it("aller-retour °C", () => {
    expect(fToC(cToF(67))).toBeCloseTo(67, EXACT);
  });
});

describe("densité ↔ points", () => {
  it("points(SG) sur valeur connue (1.050 = 50 points)", () => {
    expect(points(1.05)).toBeCloseTo(50, EXACT);
    expect(sgFromPoints(50)).toBeCloseTo(1.05, EXACT);
  });

  it("aller-retour points", () => {
    expect(sgFromPoints(points(1.052))).toBeCloseTo(1.052, EXACT);
  });
});

describe("SG ↔ Plato", () => {
  it("1.040 ≈ 10 °P (valeur de contrôle)", () => {
    expect(sgToPlato(1.04)).toBeCloseTo(10, 1);
    expect(platoToSg(10)).toBeCloseTo(1.04, 3);
  });

  it("aller-retour SG → Plato → SG", () => {
    expect(platoToSg(sgToPlato(1.048))).toBeCloseTo(1.048, 3);
  });

  it("Brix ≈ Plato (identité nominale §0.1)", () => {
    expect(brixToPlato(12)).toBe(12);
    expect(platoToBrix(12)).toBe(12);
  });
});

describe("couleur", () => {
  it("SRM ↔ EBC (EBC = SRM × 1.97)", () => {
    expect(srmToEbc(10)).toBeCloseTo(19.7, EXACT);
    expect(ebcToSrm(19.7)).toBeCloseTo(10, EXACT);
    expect(ebcToSrm(srmToEbc(6))).toBeCloseTo(6, EXACT);
  });

  it("°Lovibond ↔ SRM (SRM = 1.3546 × °L − 0.76)", () => {
    expect(lovibondToSrm(10)).toBeCloseTo(12.786, 3);
    expect(srmToLovibond(lovibondToSrm(8))).toBeCloseTo(8, EXACT);
  });
});

describe("pression", () => {
  it("PSI ↔ bar (bar = PSI × 0.0689476)", () => {
    expect(psiToBar(1)).toBeCloseTo(0.0689476, EXACT);
    expect(barToPsi(0.0689476)).toBeCloseTo(1, EXACT);
    expect(barToPsi(psiToBar(11))).toBeCloseTo(11, EXACT);
  });
});
