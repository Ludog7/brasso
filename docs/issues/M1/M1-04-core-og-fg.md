---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-04 — core : densités OG / FG / boilGravity

## Contexte
FORMULES-BRASSICOLES.md §1 (OG), §2 (FG), §4.2 (boil gravity). Base de tout le moteur BEER (ABV, IBU dépendent de ces valeurs).

## Objectif
`calcOg`, `calcFg`, `boilGravity` implémentés dans `packages/core`, validés contre les valeurs de référence.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/gravity.ts`, tests associés.
- Hors périmètre explicite : ABV (M1-05), IBU (M1-06).

## Spécification (FORMULES §1, §2, §4.2)
- `calcOg(fermentables, efficiencyPct, batchVolumeL)` : pour chaque fermentescible, `contribPoints = points(potentialSg) × massKg × (isMashable ? eff : 1)`, `OG_points = Σ / batchVolumeL`, `OG = 1 + OG_points/1000`.
- `calcFg(ogPoints, attenuationPct)` : `FG_points = OG_points × (1 − attén)`. Atténuation apparente, levure dominante.
- `boilGravity(ogPoints, batchVolumeL, boilVolumeL)` = `1 + (OG_points × batchVolumeL / boilVolumeL)/1000`.
- Cas limites §1.3/§2 : `batchVolumeL=0` → erreur de validation ; aucun fermentescible → OG 1.000 ; borner `efficiencyPct ∈ [50,95]` et `attén ∈ [0.5,0.95]` avec avertissement hors plage.

## Definition of Done
- [ ] Fonctions implémentées, interfaces conformes au §11
- [ ] Cas limites gérés (division interdite, bornes, avertissements)
- [ ] Tests de validation : au moins un cas OG documenté + FG cohérent
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-03}} — Bloque : {{M1-05}}, {{M1-06}}
