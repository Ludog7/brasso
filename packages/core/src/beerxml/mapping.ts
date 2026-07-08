/**
 * Correspondances d'énumérations BeerXML ↔ `core` (types de fermentescible, `USE`
 * et `FORM` de houblon). Partagées par `parse` et `serialize` pour garantir un
 * aller-retour cohérent. Aucune conversion d'unité ici (celles-ci vivent dans
 * `units.ts`) — uniquement des tables de libellés.
 */

import type { HopForm, HopUse } from "../formulas/ibu.js";
import type { BeerXmlFermentableType } from "./types.js";

/** Types de fermentescible empâtés (le rendement s'y applique, cf. moteur BEER). */
const MASHABLE_TYPES: ReadonlySet<BeerXmlFermentableType> = new Set(["Grain", "Adjunct"]);

/** Canonicalise un `FERMENTABLE/TYPE` BeerXML (insensible à la casse ; défaut `Adjunct`). */
export function fermentableType(raw: string): BeerXmlFermentableType {
  switch (raw.trim().toLowerCase()) {
    case "grain":
      return "Grain";
    case "sugar":
      return "Sugar";
    case "extract":
      return "Extract";
    case "dry extract":
      return "Dry Extract";
    default:
      return "Adjunct";
  }
}

/** Un fermentescible est-il empâté (rendement appliqué) selon son type BeerXML ? */
export function isMashableType(type: BeerXmlFermentableType): boolean {
  return MASHABLE_TYPES.has(type);
}

/** BeerXML `HOP/USE` → `HopUse` du moteur (insensible à la casse ; défaut `boil`). */
export function hopUseFromXml(raw: string): HopUse {
  switch (raw.trim().toLowerCase()) {
    case "dry hop":
      return "dry_hop";
    case "first wort":
      return "first_wort";
    case "aroma":
      return "whirlpool";
    case "boil":
    case "mash":
    default:
      return "boil";
  }
}

/** `HopUse` du moteur → BeerXML `HOP/USE`. `hop_stand` s'exporte en `Aroma`. */
export function hopUseToXml(use: HopUse): string {
  switch (use) {
    case "dry_hop":
      return "Dry Hop";
    case "first_wort":
      return "First Wort";
    case "whirlpool":
    case "hop_stand":
      return "Aroma";
    case "boil":
      return "Boil";
  }
}

/** BeerXML `HOP/FORM` → `HopForm` du moteur (insensible à la casse) ; inconnu → `undefined`. */
export function hopFormFromXml(raw: string | undefined): HopForm | undefined {
  switch (raw?.trim().toLowerCase()) {
    case "pellet":
      return "pellet";
    case "plug":
      return "plug";
    case "leaf":
      return "leaf";
    default:
      return undefined;
  }
}

/** `HopForm` du moteur → BeerXML `HOP/FORM`. `cryo` s'exporte en `Pellet`. */
export function hopFormToXml(form: HopForm): string {
  switch (form) {
    case "plug":
      return "Plug";
    case "leaf":
      return "Leaf";
    case "pellet":
    case "cryo":
      return "Pellet";
  }
}
