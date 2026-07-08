/**
 * Import/export BeerXML 1.0 — **moteur BEER uniquement** (spec fonctionnelle
 * « BeerXML — scope limité »). Aller-retour fidèle entre BeerXML et l'entrée
 * recette du core ; ALT_FERMENTED / SOFT_DRINK sont explicitement refusés.
 */

export { parseBeerXml } from "./parse.js";
export { beerXmlToBeerRecipe } from "./recipe.js";
export { serializeBeerXml } from "./serialize.js";
export * from "./types.js";
