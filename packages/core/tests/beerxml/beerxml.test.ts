import { describe, expect, it } from "vitest";

import {
  BeerXmlEngineError,
  type BeerXmlRecipe,
  beerXmlToBeerRecipe,
  BeerXmlValidationError,
  computeBeer,
  parseBeerXml,
  serializeBeerXml,
  srmToEbc,
  yieldToPotentialSg,
} from "../../src/index.js";

// ── Fixture : American Pale Ale (style d'une recette BeerXML publique) ────────

const APA_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES>
  <RECIPE>
    <NAME>American Pale Ale</NAME>
    <VERSION>1</VERSION>
    <TYPE>All Grain</TYPE>
    <BREWER>Assoc Brasso</BREWER>
    <BATCH_SIZE>20.0</BATCH_SIZE>
    <BOIL_SIZE>24.0</BOIL_SIZE>
    <BOIL_TIME>60</BOIL_TIME>
    <EFFICIENCY>72.0</EFFICIENCY>
    <NOTES>Champ inconnu toléré</NOTES>
    <STYLE>
      <NAME>American Pale Ale</NAME>
      <VERSION>1</VERSION>
      <CATEGORY>Pale American Ale</CATEGORY>
      <OG_MIN>1.045</OG_MIN>
      <OG_MAX>1.060</OG_MAX>
      <FG_MIN>1.010</FG_MIN>
      <FG_MAX>1.015</FG_MAX>
      <IBU_MIN>30.0</IBU_MIN>
      <IBU_MAX>45.0</IBU_MAX>
      <COLOR_MIN>6.0</COLOR_MIN>
      <COLOR_MAX>14.0</COLOR_MAX>
    </STYLE>
    <FERMENTABLES>
      <FERMENTABLE>
        <NAME>Pale Malt</NAME>
        <VERSION>1</VERSION>
        <TYPE>Grain</TYPE>
        <AMOUNT>5.0</AMOUNT>
        <YIELD>80.0</YIELD>
        <COLOR>3.0</COLOR>
        <UNKNOWN_ATTR>ignored</UNKNOWN_ATTR>
      </FERMENTABLE>
      <FERMENTABLE>
        <NAME>Caramel 60</NAME>
        <VERSION>1</VERSION>
        <TYPE>Grain</TYPE>
        <AMOUNT>0.5</AMOUNT>
        <YIELD>75.0</YIELD>
        <COLOR>60.0</COLOR>
      </FERMENTABLE>
    </FERMENTABLES>
    <HOPS>
      <HOP>
        <NAME>Cascade</NAME>
        <VERSION>1</VERSION>
        <ALPHA>5.5</ALPHA>
        <AMOUNT>0.028</AMOUNT>
        <USE>Boil</USE>
        <TIME>60</TIME>
        <FORM>Pellet</FORM>
      </HOP>
      <HOP>
        <NAME>Citra</NAME>
        <VERSION>1</VERSION>
        <ALPHA>12.0</ALPHA>
        <AMOUNT>0.028</AMOUNT>
        <USE>Dry Hop</USE>
        <TIME>0</TIME>
      </HOP>
    </HOPS>
    <YEASTS>
      <YEAST>
        <NAME>SafAle US-05</NAME>
        <VERSION>1</VERSION>
        <ATTENUATION>78.0</ATTENUATION>
      </YEAST>
    </YEASTS>
    <MISCS>
      <MISC>
        <NAME>Irish Moss</NAME>
        <VERSION>1</VERSION>
        <TYPE>Fining</TYPE>
        <USE>Boil</USE>
        <AMOUNT_IS_WEIGHT>TRUE</AMOUNT_IS_WEIGHT>
        <AMOUNT>0.005</AMOUNT>
      </MISC>
    </MISCS>
  </RECIPE>
</RECIPES>`;

/** DTO canonique en unités internes, valeurs « propres » → aller-retour exact. */
function canonicalRecipe(): BeerXmlRecipe {
  return {
    engine: "BEER",
    name: "Round Trip Ale",
    type: "All Grain",
    batchVolumeL: 20,
    boilVolumeL: 24,
    boilTimeMin: 60,
    efficiencyPct: 72,
    fermentables: [
      {
        name: "Pale",
        type: "Grain",
        amountG: 5000,
        potentialSg: yieldToPotentialSg(80),
        colorEbc: srmToEbc(3),
      },
      {
        name: "Dextrose",
        type: "Sugar",
        amountG: 500,
        potentialSg: yieldToPotentialSg(100),
        colorEbc: srmToEbc(0),
      },
    ],
    hops: [
      {
        name: "Magnum",
        amountG: 20,
        alphaFraction: 0.12,
        timeMin: 60,
        use: "boil",
        form: "pellet",
      },
      {
        name: "Cascade",
        amountG: 15,
        alphaFraction: 0.055,
        timeMin: 5,
        use: "first_wort",
        form: "leaf",
      },
      {
        name: "Citra",
        amountG: 30,
        alphaFraction: 0.12,
        timeMin: 0,
        use: "whirlpool",
        form: "plug",
      },
      { name: "Mosaic", amountG: 40, alphaFraction: 0.115, timeMin: 0, use: "dry_hop" },
    ],
    yeasts: [{ name: "US-05", attenuationPct: 78 }],
    miscs: [{ name: "Irish Moss", type: "Fining", use: "Boil", amountIsWeight: true, amountG: 5 }],
    style: {
      name: "APA",
      category: "Pale American Ale",
      ogMin: 1.045,
      ogMax: 1.06,
      fgMin: 1.01,
      fgMax: 1.015,
      ibuMin: 30,
      ibuMax: 45,
      ebcMin: srmToEbc(6),
      ebcMax: srmToEbc(14),
    },
  };
}

describe("parseBeerXml — import", () => {
  it("importe une recette et convertit vers les unités internes", () => {
    const r = parseBeerXml(APA_FIXTURE);

    expect(r.engine).toBe("BEER");
    expect(r.name).toBe("American Pale Ale");
    expect(r.type).toBe("All Grain");
    expect(r.batchVolumeL).toBe(20);
    expect(r.boilVolumeL).toBe(24);
    expect(r.boilTimeMin).toBe(60);
    expect(r.efficiencyPct).toBe(72);

    // Fermentables : kg→g, YIELD %→potentiel, COLOR SRM→EBC.
    expect(r.fermentables[0]).toEqual({
      name: "Pale Malt",
      type: "Grain",
      amountG: 5000,
      potentialSg: yieldToPotentialSg(80),
      colorEbc: srmToEbc(3),
    });
    expect(r.fermentables[1]?.colorEbc).toBeCloseTo(srmToEbc(60), 6);

    // Houblons : kg→g, ALPHA %→fraction, USE/FORM mappés.
    expect(r.hops[0]).toEqual({
      name: "Cascade",
      amountG: 28,
      alphaFraction: 0.055,
      timeMin: 60,
      use: "boil",
      form: "pellet",
    });
    expect(r.hops[1]?.use).toBe("dry_hop");
    expect(r.hops[1]?.form).toBeUndefined();

    expect(r.yeasts).toEqual([{ name: "SafAle US-05", attenuationPct: 78 }]);
    expect(r.miscs[0]).toEqual({
      name: "Irish Moss",
      type: "Fining",
      use: "Boil",
      amountIsWeight: true,
      amountG: 5,
    });

    // Style : plages OG/FG/IBU directes, couleur SRM→EBC.
    expect(r.style?.ogMin).toBe(1.045);
    expect(r.style?.ibuMax).toBe(45);
    expect(r.style?.ebcMin).toBeCloseTo(srmToEbc(6), 6);
  });

  it("produit une entrée moteur dont computeBeer donne des valeurs plausibles", () => {
    const result = computeBeer(beerXmlToBeerRecipe(parseBeerXml(APA_FIXTURE)));
    expect(result.og).toBeGreaterThan(1);
    expect(result.og).toBeLessThan(1.05);
    expect(result.fg).toBeGreaterThan(1);
    expect(result.abv).toBeGreaterThanOrEqual(0);
    expect(result.ibu).toBeGreaterThan(0);
    expect(result.ebc).toBeGreaterThan(0);
    expect(result.colorHex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("ignore les champs inconnus sans erreur", () => {
    // La fixture contient <NOTES> et <UNKNOWN_ATTR> : l'import réussit.
    expect(() => parseBeerXml(APA_FIXTURE)).not.toThrow();
  });

  it("tolère les balises en minuscules (BeerXML nominalement en majuscules)", () => {
    const lower = `<recipes><recipe>
      <name>Lower</name><type>Extract</type>
      <batch_size>10</batch_size><boil_size>12</boil_size>
      <boil_time>60</boil_time><efficiency>70</efficiency>
    </recipe></recipes>`;
    const r = parseBeerXml(lower);
    expect(r.name).toBe("Lower");
    expect(r.type).toBe("Extract");
    expect(r.batchVolumeL).toBe(10);
  });

  it("mappe les variantes de TYPE / USE / FORM (y compris cas de repli)", () => {
    const xml = `<RECIPES><RECIPE>
      <NAME>Variants</NAME><TYPE>Partial Mash</TYPE>
      <BATCH_SIZE>20</BATCH_SIZE><BOIL_SIZE>24</BOIL_SIZE>
      <BOIL_TIME>60</BOIL_TIME><EFFICIENCY>72</EFFICIENCY>
      <FERMENTABLES>
        <FERMENTABLE><NAME>Sugar</NAME><TYPE>Sugar</TYPE><AMOUNT>1</AMOUNT><YIELD>100</YIELD><COLOR>0</COLOR></FERMENTABLE>
        <FERMENTABLE><NAME>LME</NAME><TYPE>Extract</TYPE><AMOUNT>1</AMOUNT><YIELD>75</YIELD><COLOR>4</COLOR></FERMENTABLE>
        <FERMENTABLE><NAME>DME</NAME><TYPE>Dry Extract</TYPE><AMOUNT>1</AMOUNT><YIELD>80</YIELD><COLOR>4</COLOR></FERMENTABLE>
        <FERMENTABLE><NAME>Flaked</NAME><TYPE>Adjunct</TYPE><AMOUNT>1</AMOUNT><YIELD>70</YIELD><COLOR>1</COLOR></FERMENTABLE>
        <FERMENTABLE><NAME>Mystery</NAME><TYPE>Weird</TYPE><AMOUNT>1</AMOUNT><YIELD>70</YIELD><COLOR>1</COLOR></FERMENTABLE>
      </FERMENTABLES>
      <HOPS>
        <HOP><NAME>FW</NAME><ALPHA>5</ALPHA><AMOUNT>0.01</AMOUNT><USE>First Wort</USE><TIME>60</TIME></HOP>
        <HOP><NAME>Aroma</NAME><ALPHA>5</ALPHA><AMOUNT>0.01</AMOUNT><USE>Aroma</USE><TIME>0</TIME><FORM>Leaf</FORM></HOP>
        <HOP><NAME>MashHop</NAME><ALPHA>5</ALPHA><AMOUNT>0.01</AMOUNT><USE>Mash</USE><TIME>0</TIME><FORM>Plug</FORM></HOP>
      </HOPS>
    </RECIPE></RECIPES>`;
    const r = parseBeerXml(xml);
    expect(r.type).toBe("Partial Mash");
    expect(r.fermentables.map((f) => f.type)).toEqual([
      "Sugar",
      "Extract",
      "Dry Extract",
      "Adjunct",
      "Adjunct", // TYPE inconnu → repli Adjunct
    ]);
    expect(r.hops.map((h) => h.use)).toEqual(["first_wort", "whirlpool", "boil"]);
    expect(r.hops[1]?.form).toBe("leaf");
    expect(r.hops[2]?.form).toBe("plug");
  });

  it("champ obligatoire manquant → BeerXmlValidationError listant les chemins", () => {
    const xml = `<RECIPES><RECIPE>
      <NAME>Sans volume</NAME><TYPE>All Grain</TYPE>
      <BOIL_TIME>60</BOIL_TIME><EFFICIENCY>72</EFFICIENCY>
    </RECIPE></RECIPES>`;
    let err: unknown;
    try {
      parseBeerXml(xml);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BeerXmlValidationError);
    expect((err as BeerXmlValidationError).paths).toEqual(
      expect.arrayContaining(["RECIPE/BATCH_SIZE", "RECIPE/BOIL_SIZE"]),
    );
  });

  it("champ obligatoire d'un houblon manquant → chemin indexé", () => {
    const xml = `<RECIPES><RECIPE>
      <NAME>Hop KO</NAME><TYPE>All Grain</TYPE>
      <BATCH_SIZE>20</BATCH_SIZE><BOIL_SIZE>24</BOIL_SIZE>
      <BOIL_TIME>60</BOIL_TIME><EFFICIENCY>72</EFFICIENCY>
      <HOPS><HOP><NAME>NoAlpha</NAME><AMOUNT>0.02</AMOUNT><USE>Boil</USE><TIME>60</TIME></HOP></HOPS>
    </RECIPE></RECIPES>`;
    let err: unknown;
    try {
      parseBeerXml(xml);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BeerXmlValidationError);
    expect((err as BeerXmlValidationError).paths).toContain("RECIPE/HOPS/HOP[0]/ALPHA");
  });

  it("aucune recette dans le document → BeerXmlValidationError", () => {
    expect(() => parseBeerXml("<FOO><BAR>1</BAR></FOO>")).toThrow(BeerXmlValidationError);
  });
});

describe("serializeBeerXml — export", () => {
  it("refuse une recette non-BEER (BeerXmlEngineError)", () => {
    const alt = { engine: "ALT_FERMENTED" } as unknown as BeerXmlRecipe;
    expect(() => serializeBeerXml(alt)).toThrow(BeerXmlEngineError);
  });

  it("exporte un BeerXML bien formé, mappe les formes/usages lossy", () => {
    const dto = canonicalRecipe();
    const lossy: BeerXmlRecipe = {
      ...dto,
      hops: [
        { name: "HS", amountG: 20, alphaFraction: 0.1, timeMin: 0, use: "hop_stand", form: "cryo" },
      ],
    };
    const xml = serializeBeerXml(lossy);
    expect(xml).toContain("<?xml");
    expect(xml).toContain("<RECIPE>");
    // hop_stand → Aroma, cryo → Pellet (mappings lossy documentés).
    expect(xml).toContain("<USE>Aroma</USE>");
    expect(xml).toContain("<FORM>Pellet</FORM>");
  });
});

describe("round-trip BeerXML", () => {
  it("parse(serialize(dto)) reproduit le DTO (valeurs bijectives)", () => {
    const dto = canonicalRecipe();
    expect(parseBeerXml(serializeBeerXml(dto))).toEqual(dto);
  });

  it("serialize→import→export est idempotent (chaîne stable)", () => {
    const xml = serializeBeerXml(canonicalRecipe());
    expect(serializeBeerXml(parseBeerXml(xml))).toBe(xml);
  });

  it("round-trip d'une recette minimale (sans style, houblon sans forme, misc en volume)", () => {
    const minimal: BeerXmlRecipe = {
      engine: "BEER",
      name: "Minimal",
      type: "All Grain",
      batchVolumeL: 20,
      boilVolumeL: 24,
      boilTimeMin: 60,
      efficiencyPct: 72,
      fermentables: [
        {
          name: "Pale",
          type: "Grain",
          amountG: 4000,
          potentialSg: yieldToPotentialSg(80),
          colorEbc: srmToEbc(2),
        },
      ],
      hops: [{ name: "Saaz", amountG: 30, alphaFraction: 0.035, timeMin: 60, use: "boil" }],
      yeasts: [{ name: "S-04", attenuationPct: 75 }],
      miscs: [{ name: "Lactic Acid", type: "Water Agent", amountIsWeight: false, amountL: 0.01 }],
    };
    expect(parseBeerXml(serializeBeerXml(minimal))).toEqual(minimal);
    // Pont sans style : aucune plage BJCP transmise au moteur.
    expect(beerXmlToBeerRecipe(minimal).style).toBeUndefined();
  });
});

describe("beerXmlToBeerRecipe — pont vers le moteur", () => {
  it("atténuation par défaut si aucune levure déclarée", () => {
    const dto: BeerXmlRecipe = { ...canonicalRecipe(), yeasts: [] };
    expect(beerXmlToBeerRecipe(dto).yeastAttenuationPct).toBe(75);
  });

  it("empâtabilité dérivée du type de fermentescible", () => {
    const dto: BeerXmlRecipe = {
      ...canonicalRecipe(),
      fermentables: [
        { name: "Grain", type: "Grain", amountG: 1000, potentialSg: 1.037, colorEbc: 5 },
        { name: "Sugar", type: "Sugar", amountG: 1000, potentialSg: 1.046, colorEbc: 0 },
      ],
    };
    const recipe = beerXmlToBeerRecipe(dto);
    expect(recipe.fermentables[0]?.isMashable).toBe(true);
    expect(recipe.fermentables[1]?.isMashable).toBe(false);
  });
});
