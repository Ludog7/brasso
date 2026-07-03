---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-07 — core : couleur EBC/SRM (Morey) + ebcToHex

## Contexte
FORMULES-BRASSICOLES.md §5 + Annexe A. Couleur pour le moteur BEER et la pastille couleur affichée dans l'éditeur de recette.

## Objectif
`calcColorEbc(fermentables, batchVolumeL)` et `ebcToHex(ebc)` implémentés et validés.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/color.ts`, tests.
- Hors périmètre explicite : autres formules.

## Spécification (FORMULES §5, Annexe A)
- Morey : `MCU = Σ (amountLb × colorL)/batchGal`, `SRM = 1.4922 × MCU^0.6859`, `EBC = SRM × 1.97`.
- `ebcToLovibond(ebc) = (ebc/1.97 + 0.76)/1.3546`.
- `ebcToHex(ebc)` : interpolation linéaire RGB entre les ancres de l'Annexe A (ne pas figer une table de 80 lignes).

## Definition of Done
- [ ] Morey + ebcToHex implémentés, interface conforme §11
- [ ] **Validation** : 5 kg Pale (7 EBC ≈ 3,5 °L) dans 20 L → EBC ≈ **11–12**
- [ ] `ebcToHex` interpole correctement entre deux ancres (test sur valeur intermédiaire)
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-03}} — Bloque : {{M1-12}}
