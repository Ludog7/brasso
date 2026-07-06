/**
 * Styles BJCP — données de référence **statiques** (décision M1-02), source
 * unique côté `core` (réutilisée par le moteur BEER, l'API et le front éditeur).
 *
 * Pourquoi pas une table ? Les plages BJCP sont un standard externe figé,
 * identique pour toute instance de Brasso : ce n'est pas une configuration par
 * déploiement (≠ nom d'asso / TVA / profil d'eau, qui vivent en `Settings`,
 * ADR-01). Le champ `RecipeBeerDetails.styleBjcp` (String libre, sans FK)
 * référence un `code` ci-dessous.
 *
 * Unités (FORMULES-BRASSICOLES.md) : densités en SG brute (ex. 1.052) ; amertume
 * en IBU ; couleur en EBC (interne). Les guidelines BJCP sont publiées en SRM :
 * conversion appliquée `EBC = SRM × 1.97` puis arrondie à l'entier.
 *
 * Jeu représentatif couvrant le spectre densité / couleur / amertume (lagers
 * pâles → stouts torréfiés → belges fortes). Source : BJCP 2021.
 */

import { z } from "zod";

/** Plage cible d'un style pour l'alignement des jauges (moteur BEER). */
export const bjcpStyleSchema = z.object({
  /** Code BJCP 2021 (ex. « 21A »). Clé stable référencée par `styleBjcp`. */
  code: z.string(),
  name: z.string(),
  /** Catégorie lisible (regroupement d'affichage). */
  category: z.string(),
  ogMin: z.number(),
  ogMax: z.number(),
  fgMin: z.number(),
  fgMax: z.number(),
  ibuMin: z.number(),
  ibuMax: z.number(),
  /** Couleur en EBC (convertie depuis les SRM des guidelines). */
  ebcMin: z.number(),
  ebcMax: z.number(),
});

export type BjcpStyle = z.infer<typeof bjcpStyleSchema>;

export const BJCP_STYLES: readonly BjcpStyle[] = [
  {
    code: "4A",
    name: "Munich Helles",
    category: "Pale Lager",
    ogMin: 1.044,
    ogMax: 1.048,
    fgMin: 1.006,
    fgMax: 1.012,
    ibuMin: 16,
    ibuMax: 22,
    ebcMin: 6,
    ebcMax: 10,
  },
  {
    code: "5D",
    name: "German Pils",
    category: "Pale Bitter Lager",
    ogMin: 1.044,
    ogMax: 1.05,
    fgMin: 1.008,
    fgMax: 1.013,
    ibuMin: 22,
    ibuMax: 40,
    ebcMin: 4,
    ebcMax: 10,
  },
  {
    code: "3B",
    name: "Czech Premium Pale Lager",
    category: "Czech Lager",
    ogMin: 1.044,
    ogMax: 1.06,
    fgMin: 1.013,
    fgMax: 1.017,
    ibuMin: 30,
    ibuMax: 45,
    ebcMin: 7,
    ebcMax: 12,
  },
  {
    code: "6A",
    name: "Märzen",
    category: "Amber Malty Lager",
    ogMin: 1.054,
    ogMax: 1.06,
    fgMin: 1.01,
    fgMax: 1.014,
    ibuMin: 18,
    ibuMax: 24,
    ebcMin: 16,
    ebcMax: 33,
  },
  {
    code: "7A",
    name: "Vienna Lager",
    category: "Amber Lager",
    ogMin: 1.048,
    ogMax: 1.055,
    fgMin: 1.01,
    fgMax: 1.014,
    ibuMin: 18,
    ibuMax: 30,
    ebcMin: 18,
    ebcMax: 30,
  },
  {
    code: "10A",
    name: "Weissbier",
    category: "German Wheat Beer",
    ogMin: 1.044,
    ogMax: 1.052,
    fgMin: 1.008,
    fgMax: 1.014,
    ibuMin: 8,
    ibuMax: 15,
    ebcMin: 4,
    ebcMax: 12,
  },
  {
    code: "11B",
    name: "Best Bitter",
    category: "British Bitter",
    ogMin: 1.04,
    ogMax: 1.048,
    fgMin: 1.008,
    fgMax: 1.012,
    ibuMin: 25,
    ibuMax: 40,
    ebcMin: 16,
    ebcMax: 32,
  },
  {
    code: "15B",
    name: "Irish Stout",
    category: "Dark British Beer",
    ogMin: 1.036,
    ogMax: 1.044,
    fgMin: 1.007,
    fgMax: 1.011,
    ibuMin: 25,
    ibuMax: 45,
    ebcMin: 49,
    ebcMax: 79,
  },
  {
    code: "20A",
    name: "American Porter",
    category: "American Porter and Stout",
    ogMin: 1.05,
    ogMax: 1.07,
    fgMin: 1.012,
    fgMax: 1.018,
    ibuMin: 25,
    ibuMax: 50,
    ebcMin: 43,
    ebcMax: 79,
  },
  {
    code: "18B",
    name: "American Pale Ale",
    category: "Pale American Ale",
    ogMin: 1.045,
    ogMax: 1.06,
    fgMin: 1.01,
    fgMax: 1.015,
    ibuMin: 30,
    ibuMax: 50,
    ebcMin: 10,
    ebcMax: 20,
  },
  {
    code: "21A",
    name: "American IPA",
    category: "IPA",
    ogMin: 1.056,
    ogMax: 1.07,
    fgMin: 1.008,
    fgMax: 1.014,
    ibuMin: 40,
    ibuMax: 70,
    ebcMin: 12,
    ebcMax: 28,
  },
  {
    code: "24A",
    name: "Witbier",
    category: "Belgian Ale",
    ogMin: 1.044,
    ogMax: 1.052,
    fgMin: 1.008,
    fgMax: 1.012,
    ibuMin: 8,
    ibuMax: 20,
    ebcMin: 4,
    ebcMax: 8,
  },
  {
    code: "25B",
    name: "Saison",
    category: "Strong Belgian Ale",
    ogMin: 1.048,
    ogMax: 1.065,
    fgMin: 1.002,
    fgMax: 1.008,
    ibuMin: 20,
    ibuMax: 35,
    ebcMin: 10,
    ebcMax: 28,
  },
  {
    code: "26C",
    name: "Belgian Tripel",
    category: "Trappist Ale",
    ogMin: 1.075,
    ogMax: 1.085,
    fgMin: 1.008,
    fgMax: 1.014,
    ibuMin: 20,
    ibuMax: 40,
    ebcMin: 9,
    ebcMax: 14,
  },
];

/**
 * Recherche par `code` (ex. « 21A ») **ou** nom, insensible à la casse.
 * Requête vide/absente → tous les styles.
 */
export function searchBjcpStyles(query?: string): readonly BjcpStyle[] {
  const q = query?.trim().toLowerCase();
  if (!q) {
    return BJCP_STYLES;
  }
  return BJCP_STYLES.filter(
    (style) => style.code.toLowerCase().includes(q) || style.name.toLowerCase().includes(q),
  );
}
