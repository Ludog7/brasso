/**
 * Couleur — modèle de Morey (MCU → SRM → EBC) et pastille couleur `ebcToHex`.
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §5 + Annexe A. En cas de
 * divergence code ↔ document, le document fait foi (CLAUDE.md).
 *
 * Couleur du moteur BEER + pastille affichée dans l'éditeur de recette. Fonctions
 * pures (ADR-03). Unités internes (CLAUDE.md / `units.ts`) : couleur en EBC, masse
 * en g, volume en L ; le calcul Morey passe par les unités impériales (lb, gal, °L).
 */

import { ebcToLovibond, gToLb, lToGal, srmToEbc } from "../units.js";

// ─────────────────────────────────────────────────────────────────────────────
// Coefficients de Morey (§5) : SRM = 1.4922 × MCU^0.6859.
// ─────────────────────────────────────────────────────────────────────────────

/** Coefficient de l'équation de Morey (§5). */
export const MOREY_COEFFICIENT = 1.4922;
/** Exposant de l'équation de Morey (§5). */
export const MOREY_EXPONENT = 0.6859;

/** Un fermentescible et sa couleur (tous les ingrédients colorent le moût). */
export interface ColorFermentable {
  /** Couleur en EBC (unité interne). */
  readonly colorEbc: number;
  /** Masse en grammes (unité interne). */
  readonly amountG: number;
}

/**
 * Couleur du moût en EBC — modèle de Morey (§5).
 *
 * `MCU = Σ (amountLb × colorL) / batchGal`, `SRM = 1.4922 × MCU^0.6859`,
 * `EBC = SRM × 1.97`. La couleur de chaque fermentescible (EBC) est convertie en
 * °Lovibond via `ebcToLovibond` ; masse et volume passent en unités impériales.
 *
 * @param fermentables grist coloré (couleur en EBC, masse en g).
 * @param batchVolumeL volume final visé (L) ; doit être > 0.
 * @returns couleur en EBC. Grist vide → 0 (moût incolore).
 * @throws RangeError si `batchVolumeL ≤ 0` (division interdite).
 */
export function calcColorEbc(
  fermentables: readonly ColorFermentable[],
  batchVolumeL: number,
): number {
  if (!(batchVolumeL > 0)) {
    throw new RangeError(
      `calcColorEbc: batchVolumeL doit être > 0 (reçu ${batchVolumeL}) — division interdite.`,
    );
  }

  const batchGal = lToGal(batchVolumeL);
  let mcu = 0;
  for (const f of fermentables) {
    mcu += (gToLb(f.amountG) * ebcToLovibond(f.colorEbc)) / batchGal;
  }

  const srm = MOREY_COEFFICIENT * mcu ** MOREY_EXPONENT;
  return srmToEbc(srm);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pastille couleur — interpolation RGB entre les ancres de l'Annexe A.
// ─────────────────────────────────────────────────────────────────────────────

/** Ancres EBC → hex de l'Annexe A (interpolées, jamais figées en table de 80 lignes). */
export const EBC_HEX_ANCHORS = [
  { ebc: 2, hex: "#FBE68B" },
  { ebc: 4, hex: "#F3CA00" },
  { ebc: 8, hex: "#E08A00" },
  { ebc: 12, hex: "#D07000" },
  { ebc: 16, hex: "#C05000" },
  { ebc: 20, hex: "#A23E00" },
  { ebc: 30, hex: "#8A2A00" },
  { ebc: 40, hex: "#651900" },
  { ebc: 50, hex: "#4A1500" },
  { ebc: 60, hex: "#360E00" },
  { ebc: 80, hex: "#1A0A00" },
] as const;

type EbcAnchor = (typeof EBC_HEX_ANCHORS)[number];

/** `#RRGGBB` → composantes RGB (0–255). */
function hexToRgb(hex: string): readonly [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Composantes RGB (0–255) → `#RRGGBB` en majuscules. */
function rgbToHex(r: number, g: number, b: number): string {
  const hex = (c: number) => c.toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Interpolation linéaire RGB entre deux couleurs hex (`t` ∈ [0, 1]). */
function lerpHex(from: string, to: string, t: number): string {
  const [r0, g0, b0] = hexToRgb(from);
  const [r1, g1, b1] = hexToRgb(to);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return rgbToHex(mix(r0, r1), mix(g0, g1), mix(b0, b1));
}

/**
 * Pastille couleur : EBC → hex par interpolation linéaire RGB entre les ancres de
 * l'Annexe A. Hors bornes (≤ 2 ou ≥ 80 EBC) → couleur de l'ancre extrême.
 *
 * @param ebc couleur en EBC.
 * @returns couleur `#RRGGBB`.
 */
export function ebcToHex(ebc: number): string {
  let prev: EbcAnchor = EBC_HEX_ANCHORS[0];
  for (const anchor of EBC_HEX_ANCHORS) {
    if (ebc <= anchor.ebc) {
      const span = anchor.ebc - prev.ebc;
      const t = span === 0 ? 0 : (ebc - prev.ebc) / span;
      return lerpHex(prev.hex, anchor.hex, t);
    }
    prev = anchor;
  }
  return prev.hex;
}
