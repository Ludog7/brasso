---
labels: web, feature, P0
milestone: M2 — Recettes
---
# M2-07 — web : éditeur ALT_FERMENTED — pH, stabilisation, risque carbonatation (ADR-11)

## Contexte
Spec fonctionnelle (ALT_FERMENTED_ENGINE) : ABV/atténuation calculés, IBU/EBC non calculés, suivi pH, étape de stabilisation **obligatoire**, estimation du risque de carbonatation résiduelle. ADR-11 impose le wording « indicateur d'aide à la décision » — jamais « conforme »/« sûr » — et un disclaimer permanent.

## Objectif
Éditeur d'une recette ALT_FERMENTED (ginger beer, hydromel, kombucha…) branché dans le shell M2-05, avec indicateurs pH/carbonatation issus de `computeAltFermented`.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/recipes/alt/*`.
- Hors périmètre explicite : publication (M2-09 — mais l'éditeur signale visuellement ce qui la bloquera), moteur SOFT (M2-08).

## Spécification
- Détails ALT : `baseType` (ginger/miel/kombucha/autre), `targetPh`, `stabilizationMethod` (thermique / chaîne du froid / filtration + acidification), `residualSugarRisk`.
- IBU/EBC **masqués** (pas calculés) ; champs qualitatifs : acidité, couleur estimée (saisie manuelle).
- Ingrédients non standards autorisés (jus, sirops maison, infusions) via catégories adjuvant/sucre ; process avec macération, fermentation et étape `stabilize` (M2-02).
- Panneau temps réel via `computeAltFermented` (`@brasso/core`) : ABV estimé, atténuation, `PhIndicator` (seuil 4.6 — `PH_LOW_ACID_THRESHOLD`), `CarbonationRiskIndicator` avec alerte visible en cas de risque de surpression bouteille.
- Wording ADR-11 vérifiable : tous les libellés pH/stabilisation disent « indicateur » ; le disclaimer `FOOD_SAFETY_DISCLAIMER` du core est affiché en permanence sur l'écran.
- Si `stabilizationMethod` absent : bandeau « publication impossible sans méthode de stabilisation » (le blocage effectif est serveur, M2-03).

## Definition of Done
- [ ] Tests composants : indicateurs pH/carbo reflètent le core, IBU/EBC absents du DOM, disclaimer présent, aucun libellé « conforme »/« sûr »
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une recette ginger beer affiche l'indicateur pH et l'alerte carbonatation quand le sucre résiduel est élevé

## Dépendances
Bloqué par : {{M2-02}}, {{M2-05}} — Bloque : —
