// Catalogue d'amorçage (`CatalogItem`) — jeu minimal réaliste (M1-02).
//
// Idempotence : chaque article porte un `id` déterministe (slug) ; le seed
// `upsert` par `id` (le schéma ne pose pas de contrainte d'unicité sur `name`).
//
// Unités & conventions (CLAUDE.md / FORMULES-BRASSICOLES.md) :
//   - masses en g, volumes en L ; `unit` = unité de stock de l'article ;
//   - `potentialSg` en SG brute (ex. Pale ≈ 1.037 → 37 points/kg/L) ;
//   - `colorEbc` en EBC ; pouvoir diastasique en °Lintner ;
//   - houblons : `alphaAcid` en FRACTION (0.062 = 6,2 %), jamais en % ;
//   - levures : `attenuationPct` en % apparent (convention bases levures) ;
//   - `attributes` (JSONB) validé par les schémas Zod de core (M1-14) ; la forme
//     ci-dessous est la cible provisoire consommée par les moteurs (M1-12).
//   - `defaultUnitCostCents` (entier, jamais de flottant pour la monnaie) laissé
//     `null` quand un coût par gramme s'arrondirait à 0 (malts/sucres bon marché) :
//     le coût réel se porte au niveau du `StockLot` (données de production).

import { CatalogKind, IngredientCategory, StockUnit } from "@prisma/client";

/** Valeur d'attribut JSONB d'un article (formes validées par core/Zod, M1-14). */
type CatalogAttributes = Record<string, number | string | boolean>;

export interface SeedCatalogItem {
  /** Id déterministe (slug) — clé d'upsert idempotente. */
  id: string;
  name: string;
  kind: CatalogKind;
  category: IngredientCategory | null;
  unit: StockUnit;
  attributes: CatalogAttributes | null;
  defaultUnitCostCents: number | null;
  reorderThreshold: number | null;
}

/** Malts & céréales : potentiel (SG brute), couleur (EBC), pouvoir diastasique. */
const MALTS: SeedCatalogItem[] = [
  {
    id: "cat-malt-pilsner",
    name: "Malt Pilsner",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.037, colorEbc: 3.5, diastaticPowerLintner: 110 },
    defaultUnitCostCents: null,
    reorderThreshold: 5000,
  },
  {
    id: "cat-malt-pale-ale",
    name: "Malt Pale Ale",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.037, colorEbc: 7, diastaticPowerLintner: 120 },
    defaultUnitCostCents: null,
    reorderThreshold: 5000,
  },
  {
    id: "cat-malt-munich",
    name: "Malt Munich",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.037, colorEbc: 15, diastaticPowerLintner: 50 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-malt-vienna",
    name: "Malt Vienna",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.036, colorEbc: 8, diastaticPowerLintner: 50 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-malt-wheat",
    name: "Malt de blé",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.038, colorEbc: 4, diastaticPowerLintner: 95 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-malt-caramunich",
    name: "Malt CaraMunich",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.034, colorEbc: 90, diastaticPowerLintner: 0 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-malt-crystal-60",
    name: "Malt Crystal 60",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.034, colorEbc: 120, diastaticPowerLintner: 0 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-malt-chocolate",
    name: "Malt Chocolat",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.03, colorEbc: 900, diastaticPowerLintner: 0 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-malt-roasted-barley",
    name: "Orge torréfié",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.028, colorEbc: 1300, diastaticPowerLintner: 0 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-malt-acidulated",
    name: "Malt acidulé",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.MALT,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.033, colorEbc: 5, diastaticPowerLintner: 0 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
];

/** Sucres & extraits : considérés fermentescibles à 100 % (moteur BEER). */
const SUGARS: SeedCatalogItem[] = [
  {
    id: "cat-sugar-saccharose",
    name: "Saccharose (sucre de table)",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.SUGAR,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.046, colorEbc: 0 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-sugar-dextrose",
    name: "Dextrose (glucose monohydraté)",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.SUGAR,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.037, colorEbc: 0 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-sugar-honey",
    name: "Miel",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.SUGAR,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.035, colorEbc: 4 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-sugar-candi-amber",
    name: "Sucre candi ambré",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.SUGAR,
    unit: StockUnit.GRAM,
    attributes: { potentialSg: 1.036, colorEbc: 80 },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
];

/** Houblons : acides alpha en FRACTION, forme (pellet/cône/cryo). */
const HOPS: SeedCatalogItem[] = [
  {
    id: "cat-hop-cascade",
    name: "Cascade",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.HOP,
    unit: StockUnit.GRAM,
    attributes: { alphaAcid: 0.055, form: "PELLET" },
    defaultUnitCostCents: 5,
    reorderThreshold: 200,
  },
  {
    id: "cat-hop-saaz",
    name: "Saaz",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.HOP,
    unit: StockUnit.GRAM,
    attributes: { alphaAcid: 0.035, form: "PELLET" },
    defaultUnitCostCents: 5,
    reorderThreshold: null,
  },
  {
    id: "cat-hop-hallertau",
    name: "Hallertau Mittelfrüh",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.HOP,
    unit: StockUnit.GRAM,
    attributes: { alphaAcid: 0.04, form: "PELLET" },
    defaultUnitCostCents: 5,
    reorderThreshold: null,
  },
  {
    id: "cat-hop-magnum",
    name: "Magnum",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.HOP,
    unit: StockUnit.GRAM,
    attributes: { alphaAcid: 0.12, form: "PELLET" },
    defaultUnitCostCents: 4,
    reorderThreshold: 200,
  },
  {
    id: "cat-hop-centennial",
    name: "Centennial",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.HOP,
    unit: StockUnit.GRAM,
    attributes: { alphaAcid: 0.1, form: "PELLET" },
    defaultUnitCostCents: 6,
    reorderThreshold: null,
  },
  {
    id: "cat-hop-citra",
    name: "Citra",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.HOP,
    unit: StockUnit.GRAM,
    attributes: { alphaAcid: 0.12, form: "PELLET" },
    defaultUnitCostCents: 8,
    reorderThreshold: null,
  },
  {
    id: "cat-hop-fuggle",
    name: "Fuggle",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.HOP,
    unit: StockUnit.GRAM,
    attributes: { alphaAcid: 0.045, form: "PELLET" },
    defaultUnitCostCents: 5,
    reorderThreshold: null,
  },
  {
    id: "cat-hop-ekg",
    name: "East Kent Goldings",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.HOP,
    unit: StockUnit.GRAM,
    attributes: { alphaAcid: 0.05, form: "PELLET" },
    defaultUnitCostCents: 5,
    reorderThreshold: null,
  },
];

/** Levures & ferments : atténuation apparente, plage T°, tolérance alcool. */
const YEASTS: SeedCatalogItem[] = [
  {
    id: "cat-yeast-us05",
    name: "SafAle US-05",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.YEAST,
    unit: StockUnit.GRAM,
    attributes: {
      attenuationPct: 81,
      tempMinC: 15,
      tempMaxC: 22,
      alcoholTolerancePct: 11,
      form: "DRY",
      flocculation: "MEDIUM",
    },
    defaultUnitCostCents: 30,
    reorderThreshold: 100,
  },
  {
    id: "cat-yeast-s04",
    name: "SafAle S-04",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.YEAST,
    unit: StockUnit.GRAM,
    attributes: {
      attenuationPct: 75,
      tempMinC: 15,
      tempMaxC: 24,
      alcoholTolerancePct: 10,
      form: "DRY",
      flocculation: "HIGH",
    },
    defaultUnitCostCents: 30,
    reorderThreshold: null,
  },
  {
    id: "cat-yeast-w3470",
    name: "SafLager W-34/70",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.YEAST,
    unit: StockUnit.GRAM,
    attributes: {
      attenuationPct: 83,
      tempMinC: 9,
      tempMaxC: 15,
      alcoholTolerancePct: 11,
      form: "DRY",
      flocculation: "HIGH",
    },
    defaultUnitCostCents: 30,
    reorderThreshold: null,
  },
  {
    id: "cat-yeast-nottingham",
    name: "Lallemand Nottingham",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.YEAST,
    unit: StockUnit.GRAM,
    attributes: {
      attenuationPct: 77,
      tempMinC: 14,
      tempMaxC: 21,
      alcoholTolerancePct: 12,
      form: "DRY",
      flocculation: "HIGH",
    },
    defaultUnitCostCents: 30,
    reorderThreshold: null,
  },
  {
    id: "cat-yeast-belle-saison",
    name: "Lallemand Belle Saison",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.YEAST,
    unit: StockUnit.GRAM,
    attributes: {
      attenuationPct: 85,
      tempMinC: 18,
      tempMaxC: 30,
      alcoholTolerancePct: 12,
      form: "DRY",
      flocculation: "LOW",
    },
    defaultUnitCostCents: 30,
    reorderThreshold: null,
  },
];

/** Adjuvants : clarifiants, sels d'eau. */
const ADJUNCTS: SeedCatalogItem[] = [
  {
    id: "cat-adjunct-irish-moss",
    name: "Mousse d'Irlande",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.ADJUNCT,
    unit: StockUnit.GRAM,
    attributes: { role: "clarifier" },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-adjunct-gypsum",
    name: "Gypse (CaSO₄)",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.ADJUNCT,
    unit: StockUnit.GRAM,
    attributes: { role: "water_salt" },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-adjunct-calcium-chloride",
    name: "Chlorure de calcium (CaCl₂)",
    kind: CatalogKind.RECETTE,
    category: IngredientCategory.ADJUNCT,
    unit: StockUnit.GRAM,
    attributes: { role: "water_salt" },
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
];

/** Conditionnements : comptés à l'unité (logique de stock CONDITIONNEMENT). */
const PACKAGING: SeedCatalogItem[] = [
  {
    id: "cat-pkg-bottle-33",
    name: "Bouteille 33 cl",
    kind: CatalogKind.CONDITIONNEMENT,
    category: null,
    unit: StockUnit.UNIT,
    attributes: { volumeL: 0.33 },
    defaultUnitCostCents: 30,
    reorderThreshold: 200,
  },
  {
    id: "cat-pkg-bottle-75",
    name: "Bouteille 75 cl",
    kind: CatalogKind.CONDITIONNEMENT,
    category: null,
    unit: StockUnit.UNIT,
    attributes: { volumeL: 0.75 },
    defaultUnitCostCents: 60,
    reorderThreshold: null,
  },
  {
    id: "cat-pkg-crown-cap",
    name: "Capsule 26 mm",
    kind: CatalogKind.CONDITIONNEMENT,
    category: null,
    unit: StockUnit.UNIT,
    attributes: null,
    defaultUnitCostCents: 3,
    reorderThreshold: 500,
  },
  {
    id: "cat-pkg-muselet",
    name: "Muselet",
    kind: CatalogKind.CONDITIONNEMENT,
    category: null,
    unit: StockUnit.UNIT,
    attributes: null,
    defaultUnitCostCents: 10,
    reorderThreshold: null,
  },
  {
    id: "cat-pkg-keg-20",
    name: "Fût inox 20 L",
    kind: CatalogKind.CONDITIONNEMENT,
    category: null,
    unit: StockUnit.UNIT,
    attributes: { volumeL: 20 },
    defaultUnitCostCents: 8000,
    reorderThreshold: null,
  },
  {
    id: "cat-pkg-label",
    name: "Étiquette",
    kind: CatalogKind.CONDITIONNEMENT,
    category: null,
    unit: StockUnit.UNIT,
    attributes: null,
    defaultUnitCostCents: 5,
    reorderThreshold: null,
  },
];

/** Bulk : gaz, produits de nettoyage/désinfection (mouvements forfaitaires). */
const BULK: SeedCatalogItem[] = [
  {
    id: "cat-bulk-co2",
    name: "CO₂ (gaz)",
    kind: CatalogKind.BULK,
    category: null,
    unit: StockUnit.GRAM,
    attributes: null,
    defaultUnitCostCents: null,
    reorderThreshold: 2000,
  },
  {
    id: "cat-bulk-alkaline-cleaner",
    name: "Nettoyant alcalin",
    kind: CatalogKind.BULK,
    category: null,
    unit: StockUnit.GRAM,
    attributes: null,
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
  {
    id: "cat-bulk-sanitizer",
    name: "Désinfectant sans rinçage",
    kind: CatalogKind.BULK,
    category: null,
    unit: StockUnit.LITER,
    attributes: null,
    defaultUnitCostCents: null,
    reorderThreshold: null,
  },
];

export const CATALOG_ITEMS: readonly SeedCatalogItem[] = [
  ...MALTS,
  ...SUGARS,
  ...HOPS,
  ...YEASTS,
  ...ADJUNCTS,
  ...PACKAGING,
  ...BULK,
];
