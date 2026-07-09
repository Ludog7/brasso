---
labels: web, feature, P2
milestone: M3 — Équipements & batchs
---
# M3-10 — web : graphes de suivi du batch (densité / température)

## Contexte
Le suivi de fermentation gagne à être **visualisé** : courbe de densité (atténuation) et de température dans le temps, depuis les mesures relevées (M3-06). SPEC-ORCHESTRATION §4 (M3 : « graphes »). Cible **tablette** ; pas de dépendance de charting lourde imposée.

## Objectif
La page détail d'un batch (M3-09) affiche des graphes lisibles densité/température dérivés des mesures, mis à jour à chaque nouvelle saisie.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/batches/charts/*`, intégration dans `BatchDetailPage`, tests composants.
- Rendu **SVG maison** (léger, sans dépendance externe lourde) ou une lib déjà présente si justifiée ; accessible (aria-label, valeurs tabulaires de repli).
- Hors périmètre explicite : export d'images, prévisions/modèles (hors M3).

## Spécification
- Deux séries temporelles : densité (`GRAVITY`) et température (`TEMPERATURE`) issues de `BatchMeasure`, triées par `loggedAt`. Axes datés, bornes auto, points marqués.
- État vide (aucune mesure) → invite claire, pas d'erreur. Responsive (tablette), contrastes suffisants ; repli **tableau** accessible listant les points (pas de dataviz-only).
- Se met à jour quand une mesure est ajoutée (invalidation TanStack Query M3-09).

## Definition of Done
- [ ] Tests composants : rendu du graphe avec plusieurs points (densité + température), état vide, mise à jour après ajout d'une mesure
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : saisir plusieurs mesures de densité/température sur un batch et voir les courbes correspondantes se tracer

## Dépendances
Bloqué par : {{M3-09}} — Bloque : —
