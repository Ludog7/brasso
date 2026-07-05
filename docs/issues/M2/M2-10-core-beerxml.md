---
labels: core, feature, P1
milestone: M2 — Recettes
---
# M2-10 — core : BeerXML — import/export (BEER uniquement)

## Contexte
Spec fonctionnelle « BeerXML/BeerJSON (scope limité) » : import/export limité au moteur BEER, explicitement refusé pour ALT/SOFT. Les conversions d'unités passent exclusivement par `core/units.ts` (BeerXML : kg, %, SRM, min → interne : g, fraction, EBC).

## Objectif
`@brasso/core` expose `parseBeerXml()` et `serializeBeerXml()` : aller-retour fidèle entre BeerXML 1.0 et l'entrée recette BEER du core.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/beerxml/*`, `packages/core/tests/` (+ fixtures XML de référence).
- Hors périmètre explicite : routes API et UI (M2-12), BeerJSON, moteurs ALT/SOFT (M2-11).

## Spécification
- Import : `<RECIPES>/<RECIPE>` → entrée BEER du core : fermentables (kg→g, couleur SRM→EBC), houblons (kg→g, alpha %→fraction, use/form/time), levures, misc, style (plages OG/FG/IBU/couleur), volumes (L), boil time (min), efficiency (%→fraction). Champs inconnus ignorés sans erreur ; champs obligatoires manquants → erreur typée listant les chemins.
- Export : entrée BEER → BeerXML 1.0 valide (conversions inverses), réimportable à l'identique (round-trip).
- Refus explicite : parse d'un contenu vers ALT/SOFT ou serialize d'une recette non-BEER → erreur typée dédiée (`BeerXmlEngineError` ou équivalent).
- Parsing XML : bibliothèque légère fonctionnant navigateur **et** Node (ex. `fast-xml-parser`) — `core` reste sans dépendance UI/DB (ADR-03).
- Toute conversion d'unité passe par `units.ts` — aucune constante locale.

## Definition of Done
- [ ] Tests : fixtures BeerXML réelles importées avec valeurs attendues, round-trip export→import stable, erreurs typées (moteur non-BEER, champ manquant)
- [ ] Couverture `core` ≥ 90 % maintenue (gate M1-14)
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une recette BeerXML publique s'importe et `computeBeer` produit des valeurs plausibles

## Dépendances
Bloqué par : {{M1-03}}, {{M1-14}} — Bloque : {{M2-12}}
