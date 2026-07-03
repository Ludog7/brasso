---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-05 — core : ABV / ABW (standard + alternate)

## Contexte
FORMULES-BRASSICOLES.md §3. Le taux d'alcool est utilisé par les moteurs BEER et ALT_FERMENTED et affiché dans l'UI recette.

## Objectif
`calcAbv(og, fg, method)` et `calcAbw(abv, fg)` implémentés et validés contre la valeur de référence.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/abv.ts`, tests.
- Hors périmètre explicite : IBU, couleur.

## Spécification (FORMULES §3)
- `calcAbv(og, fg, method: 'standard'|'alternate' = 'standard')` :
  - standard : `(OG − FG) × 131.25` (constante `ABV_FACTOR`).
  - alternate (bières fortes) : `(76.08 × (OG−FG) / (1.775 − OG)) × (FG / 0.794)`.
- `calcAbw(abv, fg)` = `abv × 0.789 / fg`.

## Definition of Done
- [ ] Deux méthodes implémentées, interface conforme §3.4
- [ ] **Validation** : American IPA OG 1.060 / FG 1.012 → ABV standard ≈ **6,30 %**
- [ ] Test comparant standard vs alternate sur une bière forte
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-04}} — Bloque : {{M1-12}}
