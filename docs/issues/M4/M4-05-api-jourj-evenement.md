---
labels: api, feature, P0
milestone: M4 — Jour J
---
# M4-05 — api : appliquer un événement Jour J (transition serveur) + clôture

## Contexte
Cœur du Jour J : le client émet des événements, le **serveur** applique la machine pure ({{M1-13}}) et persiste l'instantané + les effets (mesures append-only, journal d'écart). ADR-08 : serveur = vérité ; horodatage serveur à la synchro.

## Objectif
`POST /api/batches/:id/day/events` applique un `DayEvent` validé, persiste le nouvel état (`revision + 1`) et ses effets, et **clôt** le Jour J en fin de parcours (→ `EN_FERMENTATION`).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/batches/day.service.ts`, `day.routes.ts`, `day.repository.ts`.
- Hors périmètre explicite : rejeu d'une **file** offline (M4-06 s'appuie sur cet applicateur unitaire), corrections densité (M4-07).

## Spécification
- Corps validé par `dayEventSchema` (M4-01). Charger `BatchDayState`, appeler `transition(state, event)` ({{M1-13}}). Si `rejection` → **409** (état **inchangé**, message). Sinon, en **transaction**, persister `state`, `revision++`, `phase` (mapping) et les effets :
  - `RECORD_MEASUREMENT` → insérer un `BatchMeasure` (map `density→GRAVITY`, `temperature→TEMPERATURE`, `volume→VOLUME`, `ph→PH` ; `phase` courante ; `loggedById` = utilisateur).
  - `FORCE_STEP` → insérer un `DeviationLog` (`step`, `phase`, `reason`, `authorId` = utilisateur, `forcedFromStatus`, `occurredAt = event.at`).
  - Si `isFinished(newState)` (curseur au-delà de `PITCHING`) → statut batch `EN_FERMENTATION` (jalon `fermentedAt`), `phase` DayPhase = `TERMINE`.
- `at` : en mode **en ligne**, le serveur fixe/valide `at = maintenant` si absent ; en mode **file**, l'appelant fournit l'`at` capté (M4-06). Réponse : `{ state, timings, revision, deviation?, rejection? }`.
- Les timers ne sont **jamais** calculés côté serveur en tâche de fond : `stepTiming` est dérivé à la lecture avec `now`. RBAC `recettes:update`.

## Definition of Done
- [ ] Tests d'intégration : `START_STEP` → `CONFIRM_STABILIZATION` **arme le timer** ; `RECORD_MEASUREMENT` crée un `BatchMeasure` ; `VALIDATE_STEP` avance ; `FORCE_STEP` crée un `DeviationLog` + avance ; événement illégal → **409** état inchangé ; `PITCHING` validé → batch `EN_FERMENTATION`
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : dérouler les étapes via l'API amène le batch de `EN_BRASSAGE` à `EN_FERMENTATION`

## Dépendances
Bloqué par : {{M4-01}}, {{M4-03}}, {{M4-04}} — Bloque : {{M4-06}}, {{M4-09}}
