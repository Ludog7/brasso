import { describe, expect, it } from "vitest";

import {
  batchVolumeChain,
  packagedVolumeFromLines,
  packagingYield,
} from "../../src/batchCycle/volumes.js";

/** Profil d'équipement de référence : évaporation 3 L/h, 1 L mort, 0,5 L au transfert. */
const EQUIPMENT = { evaporationRateLPerHour: 3, deadspaceL: 1, transferLossL: 0.5 };

describe("packagingYield — rendement de conditionnement (FORMULES §13.2)", () => {
  it("valeur de référence : 30 L pré-ébullition → 24 L conditionnés = 80 %", () => {
    expect(packagingYield(30, 24)).toEqual({ percent: 80 });
  });

  it("volume pré-ébullition nul, négatif ou absent → null, sans division par zéro", () => {
    for (const pre of [0, -5, null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(packagingYield(pre, 24)).toEqual({ percent: null });
    }
  });

  it("volume conditionné absent → null (rien à rapporter)", () => {
    expect(packagingYield(30, null)).toEqual({ percent: null });
    expect(packagingYield(30, undefined)).toEqual({ percent: null });
  });

  it("rendement > 100 % : la valeur est retournée, assortie d'un avertissement", () => {
    const result = packagingYield(20, 24);
    expect(result.percent).toBe(120);
    // Ni masquée, ni écrêtée : c'est le signe d'une saisie erronée à corriger.
    expect(result.warning).toMatch(/physiquement impossible/i);
  });

  it("exactement 100 % ne déclenche aucun avertissement", () => {
    expect(packagingYield(30, 30)).toEqual({ percent: 100 });
  });

  it("un volume conditionné nul est un rendement de 0 %, pas une absence", () => {
    expect(packagingYield(30, 0)).toEqual({ percent: 0 });
  });
});

describe("batchVolumeChain — chaîne des volumes (FORMULES §13.2)", () => {
  it("estime la chaîne depuis le volume pré-ébullition mesuré et les pertes", () => {
    const chain = batchVolumeChain({ preBoilL: 30, boilTimeMin: 60, equipment: EQUIPMENT });

    // évaporation = 3 L/h × 60/60 = 3 L
    expect(chain.evaporationL).toBe(3);
    expect(chain.preBoil).toEqual({ volumeL: 30, source: "measured" });
    // post-ébullition = 30 − 3 = 27
    expect(chain.postBoil).toEqual({ volumeL: 27, source: "estimated" });
    // transféré = 27 − 1 (deadspace) − 0,5 (transfert) = 25,5
    expect(chain.transferred).toEqual({ volumeL: 25.5, source: "estimated" });
  });

  it("l'évaporation suit la durée d'ébullition (90 min → 4,5 L)", () => {
    const chain = batchVolumeChain({ preBoilL: 30, boilTimeMin: 90, equipment: EQUIPMENT });
    expect(chain.evaporationL).toBe(4.5);
    expect(chain.postBoil.volumeL).toBe(25.5);
  });

  it("une mesure prime toujours sur son estimation", () => {
    const chain = batchVolumeChain({
      preBoilL: 30,
      postBoilL: 26, // relevé réel, différent des 27 estimés
      boilTimeMin: 60,
      equipment: EQUIPMENT,
    });
    expect(chain.postBoil).toEqual({ volumeL: 26, source: "measured" });
    // …et l'aval s'appuie sur la mesure : 26 − 1,5 = 24,5, pas 25,5.
    expect(chain.transferred).toEqual({ volumeL: 24.5, source: "estimated" });
  });

  it("un volume transféré mesuré prime sur l'estimation, sans toucher l'amont", () => {
    const chain = batchVolumeChain({
      preBoilL: 30,
      transferredL: 24,
      boilTimeMin: 60,
      equipment: EQUIPMENT,
    });
    expect(chain.postBoil).toEqual({ volumeL: 27, source: "estimated" });
    expect(chain.transferred).toEqual({ volumeL: 24, source: "measured" });
  });

  it("volumes ensemencé et conditionné : constatés ou inconnus, jamais estimés", () => {
    const withoutMeasures = batchVolumeChain({
      preBoilL: 30,
      boilTimeMin: 60,
      equipment: EQUIPMENT,
    });
    // On n'invente pas une donnée que seul l'opérateur peut établir.
    expect(withoutMeasures.pitched).toEqual({ volumeL: null, source: "unknown" });
    expect(withoutMeasures.packaged).toEqual({ volumeL: null, source: "unknown" });

    const withMeasures = batchVolumeChain({
      preBoilL: 30,
      pitchedL: 25, // relevé de volume à l'ensemencement
      packaging: [
        { containerVolumeL: 20, quantity: 1 }, // …et décompte des contenants
        { containerVolumeL: 0.75, quantity: 5 },
      ],
      boilTimeMin: 60,
      equipment: EQUIPMENT,
    });
    expect(withMeasures.pitched).toEqual({ volumeL: 25, source: "measured" });
    // 20 + 3,75 = 23,75 L conditionnés.
    expect(withMeasures.packaged).toEqual({ volumeL: 23.75, source: "measured" });
  });

  describe("données manquantes ou inexploitables", () => {
    it("sans volume pré-ébullition, la chaîne est inconnue mais ne lève pas", () => {
      const chain = batchVolumeChain({ boilTimeMin: 60, equipment: EQUIPMENT });
      expect(chain.preBoil).toEqual({ volumeL: null, source: "unknown" });
      expect(chain.postBoil).toEqual({ volumeL: null, source: "unknown" });
      expect(chain.transferred).toEqual({ volumeL: null, source: "unknown" });
      expect(chain.evaporationL).toBe(3);
    });

    it("une donnée aval reste exploitable sans amont", () => {
      const chain = batchVolumeChain({ packaging: [{ containerVolumeL: 24, quantity: 1 }] });
      expect(chain.preBoil.volumeL).toBeNull();
      expect(chain.packaged).toEqual({ volumeL: 24, source: "measured" });
    });

    it("sans durée d'ébullition ou sans taux, l'évaporation est inconnue", () => {
      expect(batchVolumeChain({ preBoilL: 30, equipment: EQUIPMENT }).evaporationL).toBeNull();
      expect(batchVolumeChain({ preBoilL: 30, boilTimeMin: 60 }).evaporationL).toBeNull();
      // …et le post-ébullition ne peut alors pas être estimé.
      expect(batchVolumeChain({ preBoilL: 30, boilTimeMin: 60 }).postBoil.source).toBe("unknown");
    });

    it("sans profil d'équipement, les pertes valent 0 — on n'en invente aucune", () => {
      const chain = batchVolumeChain({ preBoilL: 30, postBoilL: 27 });
      expect(chain.transferred).toEqual({ volumeL: 27, source: "estimated" });
    });

    it("ignore les valeurs non finies (saisie corrompue) sans lever", () => {
      const chain = batchVolumeChain({
        preBoilL: 30,
        postBoilL: Number.NaN,
        boilTimeMin: 60,
        equipment: { ...EQUIPMENT, deadspaceL: Number.POSITIVE_INFINITY },
      });
      expect(chain.postBoil).toEqual({ volumeL: 27, source: "estimated" });
      // Le deadspace inexploitable est traité comme une perte nulle.
      expect(chain.transferred.volumeL).toBe(26.5);
    });

    it("des pertes supérieures à l'amont donnent 0, jamais un volume négatif", () => {
      const chain = batchVolumeChain({
        preBoilL: 2,
        boilTimeMin: 60,
        equipment: { evaporationRateLPerHour: 3, deadspaceL: 10, transferLossL: 5 },
      });
      expect(chain.postBoil.volumeL).toBe(0);
      expect(chain.transferred.volumeL).toBe(0);
    });

    it("des pertes négatives sont traitées comme nulles (elles n'ajoutent pas de volume)", () => {
      const chain = batchVolumeChain({
        preBoilL: 30,
        postBoilL: 27,
        equipment: { deadspaceL: -5, transferLossL: -2 },
      });
      expect(chain.transferred.volumeL).toBe(27);
    });
  });

  it("bout en bout : les contenants saisis alimentent le rendement de conditionnement", () => {
    const chain = batchVolumeChain({
      preBoilL: 30,
      pitchedL: 25.5,
      // 1 fût de 20 L + 8 bouteilles de 0,5 L = 24 L conditionnés.
      packaging: [
        { containerVolumeL: 20, quantity: 1 },
        { containerVolumeL: 0.5, quantity: 8 },
      ],
      boilTimeMin: 60,
      equipment: EQUIPMENT,
    });
    expect(chain.packaged.volumeL).toBe(24);
    expect(packagingYield(chain.preBoil.volumeL, chain.packaged.volumeL)).toEqual({ percent: 80 });
  });
});

describe("packagedVolumeFromLines — volume déduit des contenants saisis", () => {
  it("somme volume × quantité sur toutes les lignes", () => {
    expect(
      packagedVolumeFromLines([
        { containerVolumeL: 20, quantity: 1 },
        { containerVolumeL: 0.75, quantity: 5 },
      ]),
    ).toBe(23.75);
  });

  it("retient le volume réellement rempli, pas la contenance nominale", () => {
    // Un fût de 20 L n'ayant reçu que 18 L compte pour 18.
    expect(packagedVolumeFromLines([{ containerVolumeL: 18, quantity: 2 }])).toBe(36);
  });

  it("une quantité nulle contribue pour zéro sans invalider la saisie", () => {
    expect(
      packagedVolumeFromLines([
        { containerVolumeL: 20, quantity: 0 },
        { containerVolumeL: 0.5, quantity: 4 },
      ]),
    ).toBe(2);
  });

  it("aucune ligne → null : un conditionnement non saisi n'est pas un volume nul", () => {
    expect(packagedVolumeFromLines([])).toBeNull();
    expect(packagedVolumeFromLines(undefined)).toBeNull();
  });

  it("ignore les lignes inexploitables, garde les valides", () => {
    expect(
      packagedVolumeFromLines([
        { containerVolumeL: Number.NaN, quantity: 3 },
        { containerVolumeL: -5, quantity: 3 },
        { containerVolumeL: 10, quantity: -2 },
        { containerVolumeL: 10, quantity: 2.5 }, // on ne conditionne pas 2,5 fûts
        { containerVolumeL: 10, quantity: Number.POSITIVE_INFINITY },
        { containerVolumeL: 0.5, quantity: 4 },
      ]),
    ).toBe(2);
  });

  it("aucune ligne exploitable → null, jamais 0", () => {
    expect(packagedVolumeFromLines([{ containerVolumeL: 10, quantity: 1.5 }])).toBeNull();
  });

  it("tolère une ligne absente du tableau sans lever", () => {
    const lines = [undefined, { containerVolumeL: 20, quantity: 1 }] as unknown as {
      containerVolumeL: number;
      quantity: number;
    }[];
    expect(packagedVolumeFromLines(lines)).toBe(20);
  });
});
