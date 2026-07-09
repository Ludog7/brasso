---
labels: api, feature, P1
milestone: M3 — Équipements & batchs
---
# M3-06 — api : mesures & transitions de statut de batch

## Contexte
Un batch porte des **mesures réelles** (volumes, densités, températures, pH) et progresse par **statuts** (`PLANIFIE → EN_BRASSAGE → EN_FERMENTATION → EN_CONDITIONNEMENT → TERMINE`, ou `ANNULE`). Le modèle Prisma `BatchMeasure` (append-only) et l'enum `BatchStatus` existent (schéma M1). Le déroulé **Jour J** (state machine, timers, DeviationLog) est **hors périmètre** — il relève de M4 (ADR-08).

## Objectif
`apps/api` permet d'enregistrer des mesures append-only sur un batch et de faire progresser son statut selon des transitions strictes (hors state machine Jour J).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/batches/*` (extension), `apps/api/tests/`.
- Schéma Zod partagé : mesure = `{ type: MeasureType, value, unit?, phase?, loggedAt? }` (réutilise `measureTypeSchema` de core).
- Hors périmètre explicite : state machine Jour J / timers / DeviationLog (M4), déduction de stock à l'ensemencement (M5), graphes (M3-10).

## Spécification
- `POST /api/batches/:id/measures` (append-only) `{ type, value, unit?, phase? }` → 201 ; `GET /api/batches/:id/measures?type=` (liste chronologique). `loggedById` = utilisateur courant.
- `POST /api/batches/:id/status` `{ status }` : transitions autorisées uniquement `PLANIFIE→EN_BRASSAGE→EN_FERMENTATION→EN_CONDITIONNEMENT→TERMINE` (linéaire) et `*→ANNULE` (sauf `TERMINE`). Toute transition illégale → 409 `INVALID_TRANSITION`. Horodate le jalon correspondant (`brewedAt`, `fermentedAt`, `packagedAt`, `completedAt`).
- Les mesures et statuts sont **indépendants** de la state machine Jour J (M4) : ici, progression administrative simple.
- **RBAC** : ressource `recettes` (brasseur/admin update, caisse read).

## Definition of Done
- [ ] Tests d'intégration : ajout de mesures + relecture ordonnée, transition légale horodate le jalon, transition illégale → 409, RBAC
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : sur un batch planifié, enregistrer une densité et une température, puis avancer le statut à `EN_BRASSAGE` (jalon `brewedAt` renseigné)

## Dépendances
Bloqué par : {{M3-04}} — Bloque : {{M3-09}}
