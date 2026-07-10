---
labels: api, feature, P0
milestone: M4 — Jour J
---
# M4-04 — api : démarrer & charger la session Jour J

## Contexte
Piloter le Jour J depuis la tablette impose que le **serveur soit la source de vérité** (ADR-08). Première brique API : instancier l'état à partir du plan dérivé (M4-01) et l'exposer. RBAC : ressource `recettes` (matrice §3.5, figée ADR-10 ; pas de ressource dédiée équipements/batchs).

## Objectif
`POST /api/batches/:id/day/start` (initialise `BatchDayState`, passe le batch en `EN_BRASSAGE`) et `GET /api/batches/:id/day` (plan + état + timings dérivés).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/batches/` (nouveaux `day.routes.ts`, `day.service.ts`, `day.repository.ts` ; câblage `app.ts`).
- Hors périmètre explicite : transitions (M4-05), rejeu offline (M4-06), corrections (M4-07).

## Spécification
- `POST /day/start` : batch en `PLANIFIE` ou `EN_BRASSAGE` requis (sinon **409**). Construit `DayPlan` via `buildDayPlan(recipeSnapshot, equipmentProfile)` (M4-01), `initDayState(plan)` ({{M1-13}}), persiste `BatchDayState` (`phase = INITIALISATION`, `state = dayState`, `revision = 0`), transition statut batch → `EN_BRASSAGE` (réutilise la logique de transition M3-06). **Idempotent** : si un `dayState` existe déjà, renvoyer l'existant sans réinitialiser.
- `GET /day` : renvoie `{ plan, state, timings }` avec `timings = stepTiming(state, now)` (le **serveur** fournit `now`) et la `phase` Prisma dérivée via `phaseToDayPhase`. **404** si aucune session.
- Validation par `dayStateSchema` / `dayPlanSchema` (M4-01). RBAC : `start` = `recettes:update` ; `get` = lecture (aligné M3-06).

## Definition of Done
- [ ] Tests d'intégration : `start` depuis `PLANIFIE` → `EN_BRASSAGE` + `BatchDayState` créé ; `start` **idempotent** (2ᵉ appel = même état) ; `get` renvoie `plan`/`state`/`timings` ; **409** si statut incompatible ; **404** `get` sans session ; RBAC
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : démarrer le Jour J d'un batch planifié renvoie un plan déroulable

## Dépendances
Bloqué par : {{M4-01}}, {{M4-03}} — Bloque : {{M4-05}}, {{M4-08}}
