---
labels: core, feature, P1
milestone: M2 — Recettes
---
# M2-11 — core : schéma JSON propriétaire — export/import ALT/SOFT

## Contexte
Spec fonctionnelle « Format JSON propriétaire » : pour les recettes alternatives (ginger beer, limonades…), un schéma JSON interne partageable entre membres et instances, couvrant ingrédients non standards, étapes de macération/stabilisation, pH et paramètres de sécurité — sans dépendre des standards bière.

## Objectif
`@brasso/core` expose un format d'échange versionné `brasso-recipe` (v1) pour ALT_FERMENTED et SOFT_DRINK : schéma Zod strict + fonctions `exportRecipeJson()` / `importRecipeJson()`.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/interchange/*`, `packages/core/tests/`.
- Hors périmètre explicite : routes API et UI (M2-12), moteur BEER (couvert par BeerXML, M2-10).

## Spécification
- Enveloppe : `{ format: "brasso-recipe", formatVersion: 1, engine: "ALT_FERMENTED" | "SOFT_DRINK", recipe: … }`.
- `recipe` réutilise les schémas Zod partagés (M1-14) : détails moteur (baseType, targetPh, `stabilizationMethod`, residualSugarRisk / sugarConcentration, storageMode), ingrédients non standards (jus, sirops maison, infusions), étapes ordonnées dont `stabilize`, unités internes (g, L, °C, fractions).
- Import : validation Zod stricte ; `formatVersion` inconnu → erreur typée « version non supportée » ; `engine: BEER` → erreur typée renvoyant vers BeerXML.
- Export : round-trip garanti (export → import ≡ identité sur les champs du schéma).
- Les paramètres de sécurité (pH, méthode de stabilisation) sont **obligatoires dans l'enveloppe exportée** pour une recette ALT publiée — cohérence ADR-11/M1-12.

## Definition of Done
- [ ] Tests : round-trip ALT et SOFT, rejets typés (version inconnue, BEER, payload invalide)
- [ ] Couverture `core` ≥ 90 % maintenue (gate M1-14)
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une ginger beer exportée se réimporte à l'identique avec ses paramètres de sécurité

## Dépendances
Bloqué par : {{M1-14}} — Bloque : {{M2-12}}
