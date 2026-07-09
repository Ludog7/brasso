---
labels: api, feature, P0
milestone: M3 — Équipements & batchs
---
# M3-04 — api : planification d'un batch (snapshot + numéro)

## Contexte
Un **batch** est l'instance d'exécution datée d'une recette (ADR-07, SPEC-FONCTIONNELLE §« Batch »). À la planification, il **fige** `recipeSnapshot` (JSONB) : le batch reste stable même si la recette évolue. Le modèle Prisma `Batch` existe (schéma M1, `batchNumber` auto-incrément, `recipeSnapshot`, `equipmentProfileId`, `status`).

## Objectif
`apps/api` permet de planifier un batch depuis une recette **PUBLISHED** : `POST /api/batches` fige le snapshot + la version + un numéro lisible + le profil d'équipement, statut `PLANIFIE`.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/batches/*` (nouveau), branchement `app.ts`, `apps/api/tests/`.
- Réutilise le service recettes (lecture) et le service équipement (M3-03).
- Hors périmètre explicite : réservation de stock (M3-05), mesures/transitions Jour J (M3-06 / M4), UI (M3-08).

## Spécification
- `POST /api/batches` `{ recipeId, equipmentProfileId?, plannedAt? }` : la recette doit être **PUBLISHED** (sinon 409 `RECIPE_NOT_PUBLISHED`) ; fige `recipeVersion` + `recipeSnapshot` (recette complète : détails moteur + ingrédients + étapes, forme JSONB) ; `batchNumber` attribué par la DB (séquence) ; statut `PLANIFIE`.
- `GET /api/batches?status=&recipeId=` (liste résumée), `GET /api/batches/:id` (détail + snapshot), `POST /api/batches/:id/cancel` (→ `ANNULE`, réservations libérées en M3-05).
- Immuabilité : le `recipeSnapshot` n'est **jamais** modifié après création (le batch ne suit pas les versions ultérieures de la recette).
- **RBAC** : ressource `recettes` (domaine brassage, §3.5 figée) — brasseur/admin create+read, caisse read.
- Repository injectable (Prisma / in-memory).

## Definition of Done
- [ ] Tests d'intégration : planification depuis une recette publiée (201 + `batchNumber` + snapshot figé), refus depuis un DRAFT (409), annulation, RBAC
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : publier une recette, planifier un batch ; le snapshot du batch reste inchangé après création d'une nouvelle version de la recette

## Dépendances
Bloqué par : {{M2-03}}, {{M3-03}} — Bloque : {{M3-05}}, {{M3-06}}, {{M3-08}}, {{M3-09}}
