---
labels: core, feature, P0
milestone: M4 — Jour J
---
# M4-01 — core : dérivation du plan Jour J + schémas Zod des événements/état

## Contexte
La state machine « Jour J » pure est déjà livrée ({{M1-13}} : réducteur `transition`, `initDayState`, `defaultDayPlan`, `stepTiming`, types `DayPlan`/`DayState`/`DayEvent`). Il manque le **pont recette → plan** : construire un `DayPlan` réel à partir du `recipeSnapshot` figé du batch (M3) + du profil d'équipement, et des **schémas Zod** pour valider les événements côté API (ADR-04, Zod vit dans `core`). SOURCE MÉTIER : `SPEC-FONCTIONNELLE.md` « State Machine Jour J » ; ADR-08.

## Objectif
`@brasso/core` expose `buildDayPlan(input)` (plan ordonné dérivé du snapshot, empâtage multi-paliers) et les schémas Zod `dayEventSchema` / `dayPlanSchema` / `dayStateSchema` + le mapping des phases core ↔ Prisma.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/stateMachine/buildPlan.ts` (nouveau), `packages/core/src/schemas/day.ts` (nouveau), exports `stateMachine/index.ts` + `schemas/index.ts`, tests `packages/core/tests/`.
- Hors périmètre explicite : persistance (M4-03), routes API (M4-04/M4-05), UI (M4-08+). **Ne pas modifier le réducteur `transition`** (sanctuarisé {{M1-13}}).

## Spécification
- `buildDayPlan({ recipeSnapshot, equipment? })` → `DayPlan` (pur, ADR-03). Mappe les `processSteps` du snapshot vers des `StepSpec` :
  - `MASH` / `MASH_STEP` → étape(s) `MASH` **répétées** pour un empâtage multi-paliers (ids stables `mash-1`, `mash-2`, …), `targetTempC`/`plannedHoldMin` issus du step, `requiresStabilization: true`, `requiredMeasurements: ["temperature"]`.
  - `SPARGE` → `LAUTER`, `requiresStabilization: false`, `requiredMeasurements: ["density","volume"]`.
  - `BOIL` → `BOIL`, `plannedHoldMin` = durée d'ébullition, `requiresStabilization: true`.
  - `COOL` → `COOLING`, `requiresStabilization: true`, `requiredMeasurements: ["temperature"]`.
  - `FERMENT` / ensemencement → `PITCHING`, jalon simple.
  - `plannedRampMin` estimé depuis le profil (`heatingPowerKw` / `thermalMassKjPerC` si présents, sinon défaut) — la primitive de rampe est indicative.
  - Fallback : `defaultDayPlan()` si le snapshot n'a aucune étape exploitable.
- Schémas Zod (alignés sur les types {{M1-13}}, **valeurs recopiées** — pas d'import DB) :
  - `dayEventSchema` : union discriminée sur `type` (`START_STEP` | `CONFIRM_STABILIZATION` | `RECORD_MEASUREMENT` | `VALIDATE_STEP` | `FORCE_STEP`), chaque variante porte `at` (epoch ms, entier ≥ 0). `FORCE_STEP` exige `author` et `reason` non vides ; `RECORD_MEASUREMENT` : `kind ∈ {density,volume,temperature,ph}`, `value` fini.
  - `dayPlanSchema`, `dayStateSchema` : round-trip de l'instantané sérialisable (persisté en JSONB, M4-03).
- Mapping des phases (à exposer, pur) : `phaseToDayPhase(phase)` — `INITIALIZATION→INITIALISATION`, `MASH→EMPATAGE`, `LAUTER→FILTRATION`, `BOIL→EBULLITION`, `COOLING→REFROIDISSEMENT`, `PITCHING→ENSEMENCEMENT`, brassin terminé `→TERMINE`. C'est la correspondance avec l'enum Prisma `DayPhase` (M4-03).

## Definition of Done
- [ ] Tests : `buildDayPlan` sur un snapshot **multi-paliers** (2 `MASH_STEP` → `mash-1`/`mash-2`), fallback `defaultDayPlan`, mapping des phases exhaustif ; `dayEventSchema` accepte/rejette (`FORCE_STEP` sans motif → rejet) ; round-trip `dayStateSchema`
- [ ] Couverture `core` ≥ 90 % maintenue
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : un `recipeSnapshot` publié (M2) produit un `DayPlan` cohérent consommable par `transition` ({{M1-13}})

## Dépendances
Bloqué par : {{M1-13}} — Bloque : {{M4-04}}, {{M4-05}}
