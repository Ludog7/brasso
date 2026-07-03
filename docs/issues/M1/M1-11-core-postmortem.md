---
labels: core, feature, P1
milestone: M1 — Modèle & core
---
# M1-11 — core : post-mortem brassin (rendement, atténuation, dilution, blend)

## Contexte
FORMULES-BRASSICOLES.md §9. Calculs a posteriori après mesures réelles d'un batch : rendement réel, atténuation réelle, ajustements de volume et mélanges. Alimentent l'analyse process (M4/fermentation) et le coût de revient (M5).

## Objectif
`realEfficiency`, `realAttenuation`, `dilute`, `blend` implémentés et validés.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/postmortem.ts`, tests.
- Hors périmètre explicite : persistance batch, UI graphes.

## Spécification (FORMULES §9)
- `realEfficiency` : `100 × pointsObtenus / pointsThéoriques`, `pointsThéoriques = Σ points(potentialSg)×massKg` (à 100 %), `pointsObtenus = OG_points_mesuré × batchVolumeL`.
- `realAttenuation(ogMeasured, fgMeasured)` : `100 × (OG_points − FG_points)/OG_points`.
- `dilute(sg1, v1, v2)` : `1 + (points(sg1)×v1/v2)/1000`.
- `blend(sgA, vA, sgB, vB)` : moyenne pondérée des points.

## Definition of Done
- [ ] 4 fonctions implémentées, interfaces conformes §11
- [ ] Tests : dilution (baisse de densité cohérente), blend (valeur pondérée), rendement/atténuation sur un cas connu
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-03}} — Bloque : —
