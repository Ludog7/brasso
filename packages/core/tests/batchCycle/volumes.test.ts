import { describe, expect, it } from "vitest";

import { batchVolumeChain, packagingYield } from "../../src/batchCycle/volumes.js";

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

  it("volumes ensemencé et conditionné : mesurés ou inconnus, jamais estimés", () => {
    const withoutMeasures = batchVolumeChain({
      preBoilL: 30,
      boilTimeMin: 60,
      equipment: EQUIPMENT,
    });
    // On n'invente pas une donnée que seul l'opérateur peut constater.
    expect(withoutMeasures.pitched).toEqual({ volumeL: null, source: "unknown" });
    expect(withoutMeasures.packaged).toEqual({ volumeL: null, source: "unknown" });

    const withMeasures = batchVolumeChain({
      preBoilL: 30,
      pitchedL: 25,
      packagedL: 24,
      boilTimeMin: 60,
      equipment: EQUIPMENT,
    });
    expect(withMeasures.pitched).toEqual({ volumeL: 25, source: "measured" });
    expect(withMeasures.packaged).toEqual({ volumeL: 24, source: "measured" });
  });

  describe("données manquantes ou inexploitables", () => {
    it("sans volume pré-ébullition, la chaîne est inconnue mais ne lève pas", () => {
      const chain = batchVolumeChain({ boilTimeMin: 60, equipment: EQUIPMENT });
      expect(chain.preBoil).toEqual({ volumeL: null, source: "unknown" });
      expect(chain.postBoil).toEqual({ volumeL: null, source: "unknown" });
      expect(chain.transferred).toEqual({ volumeL: null, source: "unknown" });
      expect(chain.evaporationL).toBe(3);
    });

    it("une mesure aval reste exploitable sans amont", () => {
      const chain = batchVolumeChain({ packagedL: 24 });
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

  it("bout en bout : la chaîne mesurée alimente le rendement de conditionnement", () => {
    const chain = batchVolumeChain({
      preBoilL: 30,
      pitchedL: 25.5,
      packagedL: 24,
      boilTimeMin: 60,
      equipment: EQUIPMENT,
    });
    expect(packagingYield(chain.preBoil.volumeL, chain.packaged.volumeL)).toEqual({ percent: 80 });
  });
});
