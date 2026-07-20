import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Garde anti-régression (#290, plan de test point A) : depuis M10-10, les 68
// utilitaires de palette Tailwind brute accordés au seul fond sombre
// (`text-amber-200`, `bg-emerald-500/10`, …) ont été remplacés par les jetons
// sémantiques `--warning` / `--success` (`text-warning`, `bg-warning/10`…).
// Rien dans le compilateur/lint n'empêche de réintroduire un utilitaire brut :
// ce test est la seule garde. Il doit nommer le fichier ET la ligne fautifs
// dans son message d'échec (Vitest imprime le diff du tableau `violations`).
//
// Palette couverte : les nuances listées par le ticket (amber, emerald, red,
// green, yellow, orange, sky), avec ou sans modificateur de variante
// (`dark:`, `hover:`, …) et/ou d'opacité (`/10`, `/40`…).
const RAW_PALETTE_RE =
  /(?:[\w-]+:)*(?:text|bg|border)-(?:amber|emerald|red|green|yellow|orange|sky)-\d{2,3}(?:\/\d{1,3})?/g;

// `new URL("../", import.meta.url)` littéral serait reconnu par Vite comme une
// référence d'asset et réécrit vers une URL servie plutôt qu'un chemin fichier
// (cf. theme-contrast.test.ts) — on passe par `path.join` pour l'éviter.
const SRC_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../");

function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Pure : liste les utilitaires de palette brute présents dans `content`, sous forme
 *  `"<relPath>:<ligne> → <utilitaire>"`. Séparée de la lecture disque pour être testable
 *  sur une fixture en mémoire (cf. test de sensibilité ci-dessous). */
function violationsInContent(relPath: string, content: string): string[] {
  const violations: string[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const matches = line.match(RAW_PALETTE_RE);
    if (matches) {
      for (const match of matches) {
        violations.push(`${relPath}:${idx + 1} → ${match}`);
      }
    }
  });
  return violations;
}

function findRawPaletteViolations(files: string[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const relPath = path.relative(SRC_ROOT, file).split(path.sep).join("/");
    violations.push(...violationsInContent(relPath, content));
  }
  return violations;
}

describe("garde anti-régression : palette Tailwind brute (#290)", () => {
  it("aucun fichier apps/web/src/**/*.tsx ne porte un utilitaire text|bg|border-<nuance brute>", () => {
    const files = collectTsxFiles(SRC_ROOT);
    const violations = findRawPaletteViolations(files);

    // Si ce tableau n'est pas vide, Vitest affiche chaque entrée dans le diff
    // d'échec : "<fichier>:<ligne> → <utilitaire>" identifie directement le fautif.
    expect(violations).toEqual([]);
  });

  it("sensibilité du garde : détecte un utilitaire brut réintroduit, laisse passer les jetons sémantiques", () => {
    // Fixture en mémoire — ne touche à aucun fichier réel. Reproduit exactement le
    // motif d'origine (avant M10-10) pour prouver que le détecteur l'attraperait
    // s'il était réintroduit.
    const regressed = [
      "export function Warn() {",
      "  return (",
      '    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">',
      "      Attention",
      "    </p>",
      "  );",
      "}",
      "",
    ].join("\n");

    const found = violationsInContent("fixture.tsx", regressed);
    expect(found).toEqual([
      "fixture.tsx:3 → border-amber-500/40",
      "fixture.tsx:3 → bg-amber-500/10",
      "fixture.tsx:3 → text-amber-200",
    ]);

    // Variante avec modificateurs (dark:, hover:) et nuances hors amber/emerald.
    const withModifiers = 'className="hover:bg-emerald-500/10 dark:text-sky-300 border-orange-400"';
    expect(violationsInContent("fixture2.tsx", withModifiers)).toEqual([
      "fixture2.tsx:1 → hover:bg-emerald-500/10",
      "fixture2.tsx:1 → dark:text-sky-300",
      "fixture2.tsx:1 → border-orange-400",
    ]);

    // Les jetons sémantiques (le remplacement attendu) ne déclenchent rien.
    const migrated = [
      "export function Warn() {",
      "  return (",
      '    <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">',
      "      Attention",
      "    </p>",
      "  );",
      "}",
      "",
    ].join("\n");
    expect(violationsInContent("fixture.tsx", migrated)).toEqual([]);

    // Non-cible : couleurs décoratives hors liste (StyleGauge conserve des teintes
    // volontairement non sémantiques, cf. C du ticket) ou noms sans nuance numérique.
    expect(
      violationsInContent("fixture3.tsx", 'className="text-amber-latte bg-primary/15"'),
    ).toEqual([]);
  });
});
