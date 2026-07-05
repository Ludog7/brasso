---
labels: api, feature, P0
milestone: M2 — Recettes
---
# M2-02 — api : ingrédients & étapes de process des recettes

## Contexte
SPEC-ORCHESTRATION §3.1 : `RecipeIngredient` (polymorphe par catégorie) et `RecipeProcessStep` (ordonné, params JSONB). La spec fonctionnelle (« Concepteur de recettes ») exige paliers d'empâtage/macération, plan de houblonnage, plan de chauffe/ébullition, plan de fermentation et stabilisation.

## Objectif
Les sous-ressources ingrédients et étapes d'une recette `DRAFT` sont éditables via l'API, avec ordre maîtrisé et validation par moteur.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/recipes/` (extension), `apps/api/tests/`.
- Hors périmètre explicite : règles de publication (M2-03), UI (M2-06/07/08).

## Spécification
- Routes (toutes restreintes à `status = DRAFT`, sinon 409) :
  - `PUT /api/recipes/:id/ingredients` — remplacement complet de la liste (ordonnée), transactionnel.
  - `PUT /api/recipes/:id/steps` — remplacement complet des étapes ordonnées (`position` continue à partir de 0).
- Ingrédients : catégorie ∈ {malt, sucre, houblon, levure, adjuvant} avec champs par catégorie (houblon : alpha en **fraction**, forme, usage, temps ; malt : couleur EBC, rendement) — unités internes de `core/units.ts` (g, L, °C, fraction).
- Étapes : `type` ∈ {mash, macerate, boil, heat, chill, ferment, stabilize, package}, `params` JSONB validé par un schéma Zod par type (réutiliser/étendre `@brasso/core` schemas).
- Validation par moteur : houblons et paliers d'empâtage pertinents pour BEER ; `stabilize` disponible pour ALT/SOFT (obligatoire à la publication ALT, contrôle fait en M2-03) ; refus des types d'étapes incohérents avec le moteur.
- Réponse : recette complète recalculable (le front rejoue `computeRecipe` localement, pas de calcul serveur ici).

## Definition of Done
- [ ] Tests d'intégration : remplacement ordonné, validation par catégorie et par moteur, rejet hors DRAFT
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une recette BEER porte malts + houblons + paliers via API ; une ALT porte une étape `stabilize`

## Dépendances
Bloqué par : {{M2-01}} — Bloque : {{M2-03}}, {{M2-06}}, {{M2-07}}, {{M2-08}}
