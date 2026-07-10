---
labels: api, feature, P0
milestone: M4 — Jour J
---
# M4-06 — api : rejeu ordonné & idempotent de la file d'actions offline

## Contexte
ADR-08 : file d'actions locale (IndexedDB) **rejouée à la reconnexion**, chaque événement horodaté (capté hors-ligne) et **idempotent**. Critère de démo M4 : wifi coupé 10 min **sans perte**.

## Objectif
`POST /api/batches/:id/day/events:sync` applique une **liste ordonnée** d'événements, chacun identifié par un `clientEventId`, en garantissant idempotence (rejeu sans double effet) et ordre.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/batches/day.service.ts` (branche `sync`), `DayEventLog` (M4-03). **S'appuie sur l'applicateur unitaire M4-05.**
- Hors périmètre explicite : file côté client / UI (M4-14).

## Spécification
- Corps : `{ events: [{ clientEventId, event }] }` triés par `event.at`. Pour chaque événement :
  - `clientEventId` déjà présent dans `DayEventLog` → **skip** (renvoyer le résultat mémorisé ; **aucune** ré-application).
  - Sinon appliquer via la logique M4-05 dans une transaction, puis enregistrer `DayEventLog` (résultat/rejet + `resultRevision`).
- Réponse : `{ state, timings, revision, results: [{ clientEventId, outcome: "applied"|"skipped"|"rejected", rejection? }] }`. Un **rejet** en milieu de file **n'interrompt pas** les suivants (chaque événement est autonome ; la machine renvoie l'état inchangé sur rejet).
- Concurrence : **sérialiser par batch** (verrou / transaction) pour un ordre déterministe. Les `at` sont fournis par le client (horodatage capté) et conservés (déterminisme {{M1-13}}).

## Definition of Done
- [ ] Tests d'intégration : rejeu du **même** `clientEventId` = **un seul** effet ; file de 3 événements appliquée **dans l'ordre** ; un rejet n'empêche pas les suivants ; état final == application en ligne équivalente (M4-05)
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : rejouer **deux fois** la même file laisse le batch dans le **même** état (idempotent)

## Dépendances
Bloqué par : {{M4-03}}, {{M4-05}} — Bloque : {{M4-14}}
