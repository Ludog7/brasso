---
labels: feature, P0
milestone: M2 — Recettes
epic: true
---
# M2 — Recettes (epic)

## Contexte
Issue chapeau du milestone M2 (SPEC-ORCHESTRATION §5.3). Regroupe le CRUD des recettes polymorphes (ADR-06), le versioning/publication immuable (ADR-07), les éditeurs temps réel par moteur (jauges BJCP / indicateurs pH / sucre — wording ADR-11) et l'import/export (BeerXML pour BEER, JSON propriétaire pour ALT/SOFT).

## Critère de démo
Créer, publier et versionner une recette de chaque type (BEER, ALT_FERMENTED, SOFT_DRINK) depuis l'UI, avec des calculs justes issus de `@brasso/core`.

## Sous-tickets
{{CHECKLIST}}

## Dépendances
Bloqué par la validation de la démo M1. Bloque le démarrage de M3 (équipements & batchs).
