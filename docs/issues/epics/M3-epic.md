---
labels: feature, P0
milestone: M3 — Équipements & batchs
epic: true
---
# M3 — Équipements & batchs (epic)

## Contexte
Issue chapeau du milestone M3 (SPEC-ORCHESTRATION §4/§5.3). Regroupe les profils d'équipement (volumes, pertes, calorique, profils d'eau), l'assemblage `core` du plan d'eau/strike temp, la création de batch (fige `recipeSnapshot` + numéro, ADR-07), la réservation de stock à la planification, le suivi (mesures, plan de fermentation, statuts) et les graphes. Le déroulé **Jour J** interactif (state machine, timers, DeviationLog) reste M4 (ADR-08).

## Critère de démo
Depuis l'UI : planifier un batch à partir d'une recette **publiée** en choisissant un profil d'équipement, avec aperçu des volumes/plan d'eau et **stock passé en réservé** ; consulter le batch (plan de fermentation, journal de mesures, graphes).

## Sous-tickets
{{CHECKLIST}}

## Dépendances
Bloqué par la validation de la démo M2 (recettes publiables). Bloque le démarrage de M4 (Jour J), qui exécute un batch planifié.
