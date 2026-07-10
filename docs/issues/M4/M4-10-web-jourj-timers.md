---
labels: web, feature, P0
milestone: M4 — Jour J
---
# M4-10 — web : timers de palier & rampe (estimé vs réel) après stabilisation

## Contexte
**Feature sanctuarisée** (`SPEC-FONCTIONNELLE.md`, {{M1-13}} `stepTiming`) : le timer de palier **ne démarre qu'après stabilisation** à la température cible **confirmée** (saisie manuelle ou sonde) ; affichage **temps estimé vs réel** de montée en chauffe.

## Objectif
UI de stabilisation (`CONFIRM_STABILIZATION`) puis compte à rebours du palier basé sur l'**horodatage serveur**, + comparaison rampe estimée / réelle.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/day/` (`StabilizationGate`, `HoldTimer`, `RampInfo`).
- Hors périmètre explicite : saisie des mesures générales (M4-11), forcer l'étape (M4-12).

## Spécification
- Si `currentStep.requiresStabilization` et statut `AWAITING_STABILIZATION` : bouton « Confirmer la stabilisation » (`CONFIRM_STABILIZATION`, température optionnelle) — **seul** déclencheur du timer. **Avant** confirmation, aucun compte à rebours affiché.
- Statut `TIMER_RUNNING` : compte à rebours dérivé de `timer.startedAt` (**serveur**) + `plannedHoldMin` via `stepTiming(state, now)` recalculé côté client à intervalle — l'**autorité reste le serveur**, le client n'invente pas d'horloge de vérité. Dépassement (`holdOverrunMin`) signalé ; « Valider » activé quand `holdElapsed`.
- Rampe : `plannedRampMin` vs `actualRampMin` (disponible après stabilisation) affichés pour la calibration.

## Definition of Done
- [ ] Tests composant : avant stabilisation → **pas** de timer + bouton « Confirmer » ; après `CONFIRM_STABILIZATION` → compte à rebours ; dépassement signalé ; rampe estimé/réel affichée
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : le timer d'empâtage ne court **qu'après** confirmation de la température

## Dépendances
Bloqué par : {{M4-05}}, {{M4-08}} — Bloque : —
