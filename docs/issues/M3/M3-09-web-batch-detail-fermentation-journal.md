---
labels: web, feature, P1
milestone: M3 — Équipements & batchs
---
# M3-09 — web : détail batch — plan de fermentation & journal

## Contexte
Un batch planifié doit être consultable et suivi : plan de fermentation (dérivé des étapes du snapshot), saisie de mesures réelles, progression de statut. SPEC-FONCTIONNELLE §Batch (mesures, dates clés, statuts). Cible **tablette** (doigts mouillés → cibles ≥ 48 px). Le **Jour J** interactif (state machine, timers) reste M4.

## Objectif
Un écran `/batches/:id` présente l'état d'un batch, son plan de fermentation dérivé du snapshot, et permet d'enregistrer des mesures et de faire progresser le statut.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/routes/batches/BatchDetailPage.tsx`, `apps/web/src/features/batches/*`, hooks (`useBatch`, `useBatchMeasures`, mutations), tests composants.
- Réutilise `batchesApi` (M3-04/06) ; dérive le plan de fermentation des étapes `FERMENT`/`CONDITION`/`STABILIZE` du `recipeSnapshot`.
- Hors périmètre explicite : graphes (M3-10), state machine Jour J (M4).

## Spécification
- En-tête : numéro de batch, recette + version figée, profil d'équipement, statut, dates clés. Réservations de stock du batch (lecture).
- **Plan de fermentation** : liste ordonnée dérivée des étapes du snapshot (température, durée cible) — lecture seule, indicatif.
- **Journal de mesures** : formulaire d'ajout (`type`, `value`, `unit?`, `phase?`) → `POST …/measures` ; tableau chronologique des mesures.
- **Statut** : boutons de transition autorisée (M3-06) avec confirmation ; transitions illégales non proposées.
- Recette snapshottée en **lecture seule** (le batch ne suit pas les versions ultérieures).

## Definition of Done
- [ ] Tests composants : rendu du détail (statut, plan de fermentation dérivé du snapshot), ajout d'une mesure (POST + apparition dans le journal), transition de statut
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : ouvrir un batch planifié, lire son plan de fermentation, saisir une densité, avancer le statut à `EN_FERMENTATION`

## Dépendances
Bloqué par : {{M3-04}}, {{M3-06}} — Bloque : {{M3-10}}
