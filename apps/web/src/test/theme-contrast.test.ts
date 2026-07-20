import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Contraste WCAG des jetons sémantiques `--warning` / `--success` (#290, plan de
// test point B/C). Les valeurs vivent dans index.css sous forme `oklch(L C H)` :
// on les LIT depuis le fichier (jamais recopiées en dur) pour ne pas diverger en
// silence du CSS réel, puis on convertit oklch → sRGB → luminance relative WCAG
// → ratio de contraste.
//
// Seuil retenu : 4,5:1 (AA, texte normal) — c'est le seuil que le ticket M10-10
// impose aux jetons `warning`/`success`.
//
// Hors périmètre volontaire : `--destructive` (tonalité "destructive" du badge,
// apps/web/src/ui/badge.tsx) n'atteint PAS AA en clair (≈3,78:1, documenté dans
// le fichier) — c'est un défaut connu suivi par le bug #292, assumé et non
// corrigé par ce ticket. Il n'est délibérément couvert par AUCUNE assertion
// AA ci-dessous.

// `new URL("../index.css", import.meta.url)` littéral serait spécifiquement
// reconnu par Vite comme une référence d'asset (et réécrit vers une URL servie,
// pas un chemin fichier) — on passe par `path.join` pour rester en dehors de
// cette détection statique et obtenir le vrai chemin disque.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.join(currentDir, "../index.css");
const css = readFileSync(CSS_PATH, "utf8");

type OklchTriple = [l: number, c: number, h: number];

function extractBlock(source: string, blockRe: RegExp): string {
  const captured = source.match(blockRe)?.[1];
  if (captured === undefined) {
    throw new Error(`Bloc CSS introuvable pour ${blockRe.source} dans ${CSS_PATH}`);
  }
  return captured;
}

/** Extrait les jetons `--nom: oklch(L C H);` d'un bloc CSS (`:root { ... }` ou `.dark { ... }`). */
function extractOklchTokens(block: string): Record<string, OklchTriple> {
  const tokens: Record<string, OklchTriple> = {};
  const re = /--([a-z0-9-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    const [, name, lRaw, cRaw, hRaw] = match;
    if (name === undefined || lRaw === undefined || cRaw === undefined || hRaw === undefined) {
      continue;
    }
    tokens[name] = [Number(lRaw), Number(cRaw), Number(hRaw)];
  }
  return tokens;
}

/** Lecture stricte d'un jeton : échoue explicitement (message nommant le jeton) plutôt que de
 *  laisser passer un `undefined` silencieux si un nom de jeton attendu disparaissait du CSS. */
function requireToken(tokens: Record<string, OklchTriple>, name: string): OklchTriple {
  const value = tokens[name];
  if (value === undefined) {
    throw new Error(`Jeton --${name} introuvable dans index.css`);
  }
  return value;
}

const rootBlock = extractBlock(css, /:root\s*\{([\s\S]*?)\}/);
const darkBlock = extractBlock(css, /\.dark\s*\{([\s\S]*?)\}/);

const lightTokens = extractOklchTokens(rootBlock);
const darkTokens = extractOklchTokens(darkBlock);

// --- oklch → sRGB → contraste WCAG ------------------------------------------------
// Matrices oklab ↔ srgb linéaire de Björn Ottosson (CSS Color Module 4).

function oklchToLinearSrgb([L, C, Hdeg]: OklchTriple): [number, number, number] {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // Clampe : les jetons du fichier sont censés rester dans le gamut sRGB ; un
  // dépassement (négatif ou >1) signalerait un jeton hors gamut, pas une erreur
  // de calcul à masquer.
  return [r, g, bl].map((c) => Math.min(1, Math.max(0, c))) as [number, number, number];
}

function linearToGamma(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function gammaToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Compose `fg` (linéaire) à l'opacité `alpha` sur `bg` (linéaire) — reproduit
 * `bg-warning/10` etc. Le mélange alpha est fait dans l'espace sRGB **gamma**
 * (c'est ainsi que le navigateur composite un fond CSS translucide, pas en
 * lumière linéaire), puis reconverti en linéaire pour le calcul de luminance.
 * Validé en le rejouant sur le cas documenté dans badge.tsx (texte
 * `--destructive` sur `bg-destructive/15` ≈ 3,78:1) : la méthode retombe pile
 * sur cette valeur, ce qui confirme qu'elle correspond au rendu réel.
 */
function compositeOver(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number],
): [number, number, number] {
  const fgGamma = fg.map(linearToGamma) as [number, number, number];
  const bgGamma = bg.map(linearToGamma) as [number, number, number];
  // Indexation littérale (0/1/2) sur des tuples de longueur fixe : reste `number`
  // (et non `number | undefined`) sous `noUncheckedIndexedAccess`, à la différence
  // d'un accès par variable sur un `Array<number>` générique.
  const mixedGamma: [number, number, number] = [
    fgGamma[0] * alpha + bgGamma[0] * (1 - alpha),
    fgGamma[1] * alpha + bgGamma[1] * (1 - alpha),
    fgGamma[2] * alpha + bgGamma[2] * (1 - alpha),
  ];
  return mixedGamma.map(gammaToLinear) as [number, number, number];
}

const AA_NORMAL_TEXT = 4.5;

describe("jetons --warning / --success — contraste WCAG AA (#290)", () => {
  describe("thème clair (:root)", () => {
    it.each([
      ["warning", "card"],
      ["warning", "background"],
      ["success", "card"],
      ["success", "background"],
    ] as const)("--%s sur --%s atteint ≥ 4,5:1", (token, bg) => {
      const fg = oklchToLinearSrgb(requireToken(lightTokens, token));
      const bgLin = oklchToLinearSrgb(requireToken(lightTokens, bg));
      expect(contrastRatio(fg, bgLin)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    // Le cas qui a réellement piégé l'implémentation (cf. commentaire index.css) :
    // le texte du jeton posé sur un aplat de lui-même à 10/15/20 % — motif des
    // encarts (`bg-warning/10`) et du badge d'anomalies du hub (`bg-warning/20`).
    it.each([
      ["warning", "card", 0.1],
      ["warning", "card", 0.15],
      ["warning", "card", 0.2],
      ["success", "card", 0.1],
      ["success", "card", 0.15],
      ["success", "card", 0.2],
      ["warning", "background", 0.1],
      ["warning", "background", 0.15],
      ["warning", "background", 0.2],
      ["success", "background", 0.1],
      ["success", "background", 0.15],
      ["success", "background", 0.2],
    ] as const)(
      "--%s sur un aplat de lui-même à %s posé sur --%s atteint ≥ 4,5:1",
      (token, bg, alpha) => {
        const fgLin = oklchToLinearSrgb(requireToken(lightTokens, token));
        const bgLin = oklchToLinearSrgb(requireToken(lightTokens, bg));
        const tintLin = compositeOver(fgLin, alpha, bgLin);
        expect(contrastRatio(fgLin, tintLin)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      },
    );
  });

  describe("thème sombre (.dark)", () => {
    it.each([
      ["warning", "card"],
      ["warning", "background"],
      ["success", "card"],
      ["success", "background"],
    ] as const)("--%s sur --%s atteint ≥ 4,5:1", (token, bg) => {
      const fg = oklchToLinearSrgb(requireToken(darkTokens, token));
      const bgLin = oklchToLinearSrgb(requireToken(darkTokens, bg));
      expect(contrastRatio(fg, bgLin)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it.each([
      ["warning", "card", 0.1],
      ["warning", "card", 0.15],
      ["warning", "card", 0.2],
      ["success", "card", 0.1],
      ["success", "card", 0.15],
      ["success", "card", 0.2],
      ["warning", "background", 0.1],
      ["warning", "background", 0.15],
      ["warning", "background", 0.2],
      ["success", "background", 0.1],
      ["success", "background", 0.15],
      ["success", "background", 0.2],
    ] as const)(
      "--%s sur un aplat de lui-même à %s posé sur --%s atteint ≥ 4,5:1",
      (token, bg, alpha) => {
        const fgLin = oklchToLinearSrgb(requireToken(darkTokens, token));
        const bgLin = oklchToLinearSrgb(requireToken(darkTokens, bg));
        const tintLin = compositeOver(fgLin, alpha, bgLin);
        expect(contrastRatio(fgLin, tintLin)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      },
    );
  });
});

describe("non-régression du rendu sombre (#290)", () => {
  // Un test de valeur exacte serait fragile (toute retouche fine de teinte le
  // casserait pour rien) : on asservit une fourchette de luminosité OKLCH — le
  // jeton sombre doit rester clair, comme les anciens `amber-200/300` /
  // `emerald-300/400` qu'il remplace — plutôt qu'une valeur figée.
  it("--warning reste clair en sombre (L ≥ 0.8)", () => {
    expect(requireToken(darkTokens, "warning")[0]).toBeGreaterThanOrEqual(0.8);
  });

  it("--success reste clair en sombre (L ≥ 0.8)", () => {
    expect(requireToken(darkTokens, "success")[0]).toBeGreaterThanOrEqual(0.8);
  });
});
