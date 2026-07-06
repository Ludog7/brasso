import { describe, expect, it } from "vitest";

import { BJCP_STYLES, bjcpStyleSchema, searchBjcpStyles } from "../../src/reference/bjcpStyles.js";

describe("BJCP_STYLES", () => {
  it("chaque entrée respecte le schéma et a des bornes cohérentes", () => {
    expect(BJCP_STYLES.length).toBeGreaterThan(0);
    for (const style of BJCP_STYLES) {
      expect(bjcpStyleSchema.parse(style)).toEqual(style);
      expect(style.ogMax).toBeGreaterThanOrEqual(style.ogMin);
      expect(style.ebcMax).toBeGreaterThanOrEqual(style.ebcMin);
    }
  });

  it("les codes sont uniques", () => {
    const codes = BJCP_STYLES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("searchBjcpStyles", () => {
  it("requête vide ou absente → tous les styles", () => {
    expect(searchBjcpStyles()).toEqual(BJCP_STYLES);
    expect(searchBjcpStyles("   ")).toEqual(BJCP_STYLES);
  });

  it("recherche par code (insensible à la casse)", () => {
    const res = searchBjcpStyles("21a");
    expect(res).toHaveLength(1);
    expect(res[0]?.name).toBe("American IPA");
  });

  it("recherche par nom", () => {
    const res = searchBjcpStyles("stout");
    expect(res.map((s) => s.code)).toContain("15B");
  });

  it("aucune correspondance → tableau vide", () => {
    expect(searchBjcpStyles("zzz-inconnu")).toEqual([]);
  });
});
