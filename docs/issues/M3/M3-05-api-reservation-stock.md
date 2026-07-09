---
labels: api, feature, P0
milestone: M3 — Équipements & batchs
---
# M3-05 — api : réservation de stock à la planification

## Contexte
SPEC-FONCTIONNELLE §Stock : « À la planification d'un batch : passage des quantités nécessaires en statut *Réservé* ». Le modèle Prisma `StockReservation` existe (schéma M1). La **déduction effective** (à l'ensemencement, volume réel) relève de M5 — M3 ne fait que **réserver**.

## Objectif
La planification d'un batch (M3-04) crée les réservations de stock des ingrédients « Recette » depuis le `recipeSnapshot` ; l'annulation les libère.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/batches/*` (extension : réservation dans le flux de création/annulation), `apps/api/tests/`.
- Réutilise `StockReservation` (statuts `RESERVED`/`CONSUMED`/`RELEASED`) et le catalogue (M2-04, résolution `catalogItemId`).
- Hors périmètre explicite : déduction effective au volume réel (M5), inventaires/mouvements (M5), UI (M3-08).

## Spécification
- À `POST /api/batches` : pour chaque ingrédient du snapshot portant un `catalogItemId` (article `RECETTE`), créer une `StockReservation` `{ batchId, catalogItemId, quantity, unit, status: RESERVED }` (quantités en unités internes). Ingrédients hors catalogue (saisis à la main) → **ignorés** de la réservation, listés dans la réponse (`unreservedIngredients`).
- **Stock insuffisant** = **non bloquant** en M3 : la planification aboutit, mais la réponse porte un indicateur `stockWarnings` (article, demandé, disponible). Le blocage éventuel relève de M5 (logique RECETTE complète).
- À `POST /api/batches/:id/cancel` : réservations du batch → `RELEASED` (jamais supprimées, traçabilité).
- Transactionnel : batch + réservations créés/annulés atomiquement.
- **RBAC** : hérité de M3-04 (ressource `recettes`).

## Definition of Done
- [ ] Tests d'intégration : réservation créée par ingrédient catalogue, ingrédient hors catalogue listé non réservé, stock insuffisant → warning non bloquant, annulation → réservations `RELEASED`
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : planifier un batch d'une recette à ingrédients catalogués réserve le stock correspondant ; annuler le batch libère ces réservations

## Dépendances
Bloqué par : {{M3-04}} — Bloque : {{M3-08}}
