---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-12 — core : 3 moteurs (BEER / ALT_FERMENTED / SOFT_DRINK) + règles de publication

## Contexte
ADR-06 (polymorphisme recettes par moteur), ADR-11 (wording pH/sécurité), spec métier « Moteurs de calcul par type de boisson ». Assemble les formules des tickets précédents en 3 moteurs cohérents, chacun exposant ce qui est pertinent pour son type de boisson.

## Objectif
`packages/core/src/engines/{beer,altFermented,softDrink}.ts` fournissent chacun une fonction pure prenant une recette et renvoyant les indicateurs calculés + les validations de publication.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/engines/*`, `packages/core/src/schemas/` (types recette par moteur), tests.
- Hors périmètre explicite : persistance (API/DB), UI éditeur (M2).

## Spécification (spec métier + ADR)
- **BEER_ENGINE** : OG, FG, ABV, IBU, EBC + alignement plages BJCP (jauges). Import/export BeerXML hors périmètre ici (M2).
- **ALT_FERMENTED_ENGINE** (ginger beer, hydromel, kombucha…) : ABV + atténuation ; **IBU/EBC non calculés** (champs qualitatifs/manuels) ; **suivi pH** ; **stabilisation OBLIGATOIRE** ; estimation du **risque de carbonatation résiduelle** (via `residualCo2`/sucre restant, alerte surpression).
- **SOFT_DRINK_ENGINE** (limonades non fermentées) : pas d'ABV/IBU ; concentration en sucre, pH, mode de conservation (froid/ambiant), stabilisation si nécessaire.
- **Règles de publication** : `stabilizationMethod` non-null obligatoire pour publier une recette ALT (règle de validation `core`, pas seulement DB — ADR-06). Indicateur pH = **aide à la décision**, jamais « conforme » (ADR-11) : les sorties du moteur portent un statut de type `indicator`, jamais un booléen « safe/conforme ».
- Moteurs = fonctions **pures** (zéro dépendance DB/UI).

## Definition of Done
- [ ] 3 moteurs implémentés, sélectionnés par `engine`
- [ ] ALT/SOFT n'exposent pas IBU/EBC ; imposent pH ; ALT exige stabilisation pour publier
- [ ] Wording ADR-11 respecté dans les types/retours (indicateur, jamais « conforme »)
- [ ] Tests par moteur, valeurs cohérentes avec les formules validées (M1-04→M1-10)
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-05}}, {{M1-06}}, {{M1-07}}, {{M1-10}} — Bloque : {{M1-14}}
