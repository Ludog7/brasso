---
labels: web, feature, P0
milestone: M4 — Jour J
---
# M4-09 — web : dérouleur d'étapes (Start / Valider, progression)

## Contexte
Mode normal : **progression contrôlée** étape par étape (`SPEC-FONCTIONNELLE.md`). Rendu de l'étape courante et actions envoyant des événements à l'API (M4-05), dans la coquille tablette (M4-08).

## Objectif
Un dérouleur affichant l'étape courante (phase, libellé, statut) + actions `Start` / `Valider` câblées sur `POST /day/events`, avec un fil de progression des phases.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/day/` (`StepRunner`, `PhaseProgress`, hook `useDayEvent`).
- Hors périmètre explicite : timers/stabilisation (M4-10), saisie de mesures (M4-11), forcer l'étape (M4-12).

## Spécification
- Rendre `currentStep` (dérivé de `state`/`plan`). **Boutons contextuels** au `StepStatus` : `PENDING` → « Démarrer » (`START_STEP`) ; `AWAITING_VALIDATION` → « Valider l'étape » (`VALIDATE_STEP`) ; désactivés dans les autres statuts. Fil de progression des phases (`INITIALISATION → … → ENSEMENCEMENT`) avec l'étape courante mise en avant.
- `useDayEvent(batchId)` : mutation `POST /day/events`, invalide `['day', batchId]` ; **toast** sur `rejection` (409) sans modifier l'état local.
- Écran de **fin** (brassin terminé → batch `EN_FERMENTATION`) avec lien vers le détail du batch (`/batches/:id`).

## Definition of Done
- [ ] Tests composant : « Démarrer » sur `PENDING` envoie `START_STEP` ; « Valider » sur `AWAITING_VALIDATION` avance ; rejet affiché ; la progression reflète le curseur
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : on déroule les phases jusqu'à l'ensemencement en mode normal

## Dépendances
Bloqué par : {{M4-05}}, {{M4-08}} — Bloque : —
