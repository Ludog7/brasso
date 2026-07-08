/**
 * Modèle d'échange BeerXML 1.0 (moteur BEER uniquement) — DTO en **unités internes**
 * (`units.ts` : masse g, volume L, densité SG brute, couleur EBC, alpha en fraction).
 * `parseBeerXml` produit ce DTO ; `serializeBeerXml` le régénère à l'identique
 * (round-trip). Le pont `beerXmlToBeerRecipe` en dérive l'entrée pure du moteur.
 *
 * Import/export limités à BEER (spec fonctionnelle « BeerXML — scope limité ») :
 * toute recette non-BEER est refusée par `BeerXmlEngineError`.
 */

import type { HopForm, HopUse } from "../formulas/ibu.js";
import type { BjcpRange } from "../schemas/recipe.js";

/** Nature de recette BeerXML (`RECIPE/TYPE`). */
export type BeerXmlRecipeType = "All Grain" | "Extract" | "Partial Mash";

/** Nature de fermentescible BeerXML (`FERMENTABLE/TYPE`). */
export type BeerXmlFermentableType = "Grain" | "Sugar" | "Extract" | "Dry Extract" | "Adjunct";

/** Fermentescible BeerXML en unités internes (`amountG`, `potentialSg`, `colorEbc`). */
export interface BeerXmlFermentable {
  readonly name: string;
  readonly type: BeerXmlFermentableType;
  /** Masse (g) — BeerXML `AMOUNT` (kg). */
  readonly amountG: number;
  /** Potentiel d'extrait (SG brute) — BeerXML `YIELD` (%). */
  readonly potentialSg: number;
  /** Couleur (EBC) — BeerXML `COLOR` (SRM). */
  readonly colorEbc: number;
}

/** Houblon BeerXML en unités internes (masse g, alpha en fraction, temps min). */
export interface BeerXmlHop {
  readonly name: string;
  /** Masse (g) — BeerXML `AMOUNT` (kg). */
  readonly amountG: number;
  /** Acides alpha en fraction — BeerXML `ALPHA` (%). */
  readonly alphaFraction: number;
  /** Durée d'ajout (min) — BeerXML `TIME`. */
  readonly timeMin: number;
  /** Type d'ajout (mappé depuis BeerXML `USE`). */
  readonly use: HopUse;
  /** Forme (mappée depuis BeerXML `FORM`) ; absente si non renseignée. */
  readonly form?: HopForm;
}

/** Levure BeerXML (nom + atténuation apparente). */
export interface BeerXmlYeast {
  readonly name: string;
  /** Atténuation apparente (%) — BeerXML `ATTENUATION`. */
  readonly attenuationPct: number;
}

/** Ingrédient divers BeerXML (`MISC`) — non pris en compte par le calcul, conservé. */
export interface BeerXmlMisc {
  readonly name: string;
  /** Type BeerXML (`Spice`, `Fining`, `Water Agent`, `Herb`, `Flavor`, `Other`). */
  readonly type: string;
  /** Moment d'emploi (`USE`) éventuel. */
  readonly use?: string;
  /** Quantité exprimée en masse (`AMOUNT_IS_WEIGHT`) plutôt qu'en volume. */
  readonly amountIsWeight: boolean;
  /** Masse (g) si `amountIsWeight`, sinon absent. */
  readonly amountG?: number;
  /** Volume (L) si non exprimé en masse, sinon absent. */
  readonly amountL?: number;
}

/** Style BeerXML : plage BJCP (unités internes) + nom/catégorie conservés. */
export interface BeerXmlStyleRange extends BjcpRange {
  readonly name?: string;
  readonly category?: string;
}

/** Recette BeerXML complète (moteur BEER) — sortie de `parseBeerXml`. */
export interface BeerXmlRecipe {
  readonly engine: "BEER";
  readonly name: string;
  readonly type: BeerXmlRecipeType;
  /** Volume final (L) — BeerXML `BATCH_SIZE`. */
  readonly batchVolumeL: number;
  /** Volume en début d'ébullition (L) — BeerXML `BOIL_SIZE`. */
  readonly boilVolumeL: number;
  /** Durée d'ébullition (min) — BeerXML `BOIL_TIME`. */
  readonly boilTimeMin: number;
  /** Rendement de brassage (%) — BeerXML `EFFICIENCY`. */
  readonly efficiencyPct: number;
  readonly fermentables: readonly BeerXmlFermentable[];
  readonly hops: readonly BeerXmlHop[];
  readonly yeasts: readonly BeerXmlYeast[];
  readonly miscs: readonly BeerXmlMisc[];
  readonly style?: BeerXmlStyleRange;
}

/**
 * Refus d'une opération BeerXML sur un moteur non-BEER (ALT_FERMENTED / SOFT_DRINK) —
 * l'import/export est explicitement limité à BEER (spec fonctionnelle).
 */
export class BeerXmlEngineError extends Error {
  readonly engine: string;
  constructor(engine: string) {
    super(`BeerXML est réservé au moteur BEER ; moteur reçu : ${engine}.`);
    this.name = "BeerXmlEngineError";
    this.engine = engine;
  }
}

/**
 * Contenu BeerXML invalide : champs obligatoires manquants. `paths` liste les
 * chemins concernés (ex. `RECIPE/BATCH_SIZE`, `RECIPE/HOPS/HOP[0]/ALPHA`).
 */
export class BeerXmlValidationError extends Error {
  readonly paths: readonly string[];
  constructor(paths: readonly string[]) {
    super(`BeerXML invalide — champs obligatoires manquants : ${paths.join(", ")}.`);
    this.name = "BeerXmlValidationError";
    this.paths = paths;
  }
}
