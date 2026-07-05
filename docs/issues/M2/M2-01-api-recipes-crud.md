---
labels: api, feature, P0
milestone: M2 — Recettes
---
# M2-01 — api : module recipes — CRUD des brouillons (commun + détails par moteur)

## Contexte
ADR-06 (polymorphisme recettes : table commune + tables de détail par moteur) et SPEC-ORCHESTRATION §3.1. Le schéma Prisma (M1-01) et les schémas Zod partagés (M1-14) existent ; il faut exposer le premier module API métier `apps/api/src/modules/recipes/` selon la structure routes/service/repository (M0-05).

## Objectif
CRUD complet des recettes en statut `DRAFT` via REST, validé par les schémas Zod de `@brasso/core`, avec écriture transactionnelle Recipe + table de détail.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/recipes/{routes,service,repository}.ts`, `apps/api/tests/`.
- Hors périmètre explicite : ingrédients & étapes de process (M2-02), versioning/publication (M2-03), import/export (M2-12).

## Spécification
- Routes :
  - `GET /api/recipes` — liste, filtres `engine`, `status`, `familyId`, tri par `updatedAt` desc.
  - `GET /api/recipes/:id` — détail complet (commun + détail moteur + ingrédients + steps s'ils existent).
  - `POST /api/recipes` — crée un `DRAFT` version 1, nouveau `familyId`, corps discriminé par `engine` (union Zod de `@brasso/core`).
  - `PATCH /api/recipes/:id` — modification, **uniquement si `status = DRAFT`**, sinon 409.
  - `DELETE /api/recipes/:id` — suppression, **uniquement si `status = DRAFT`**, sinon 409.
- Écriture `Recipe` + `RecipeBeerDetails`/`RecipeAltDetails`/`RecipeSoftDetails` dans une transaction Prisma (ADR-06 : 1-1 strict selon `engine`).
- RBAC deny-by-default (M0-07) : couple (recipes, read|create|update|delete) selon la matrice §3.5 — admin/brasseur CRUD, caisse R.
- Erreurs normalisées via l'error handler existant (400 validation, 404, 409 statut).

## Definition of Done
- [ ] Tests d'intégration API : CRUD des 3 moteurs, rejet PATCH/DELETE sur non-DRAFT, RBAC (caisse ne peut pas créer)
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : créer et relire une recette DRAFT de chaque moteur via l'API

## Dépendances
Bloqué par : {{M1-01}}, {{M1-14}}, {{M0-07}} — Bloque : {{M2-02}}, {{M2-03}}, {{M2-05}}
