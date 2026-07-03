---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-06 — core : amertume IBU (Tinseth + Rager, règles par `use`)

## Contexte
FORMULES-BRASSICOLES.md §4. Amertume pour le moteur BEER uniquement (non pertinent ALT/SOFT — cf. spec métier). Dépend de `boilGravity` (M1-04).

## Objectif
`calcIbu(additions, boilGravity, batchVolumeL, method)` implémenté avec Tinseth (défaut) et Rager, validé au cas de référence.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/ibu.ts`, tests.
- Hors périmètre explicite : couleur, carbonatation.

## Spécification (FORMULES §4)
- **Tinseth** (§4.1) : `fDensité = 1.65 × 0.000125^(boilGravity−1)`, `fTemps = (1 − e^(−0.04×timeMin))/4.15`, `util = fDensité×fTemps`, `mgAlphaParL = (alphaFraction × amountG × 1000)/batchVolumeL`, `ibuAjout = mgAlphaParL × util`, `IBU = Σ`.
- **Rager** (§4.5) en alternative.
- **Règles par `use`** (§4.3) : `boil` = formule complète ; `first_wort` = comme boil à `boilTimeMin` ; `whirlpool/hop_stand` = utilisation réduite (facteur configurable ×0.5) ; `dry_hop` = **IBU 0**.
- Corrections optionnelles configurables (§4.4) : pellets ×1.10, bag ×0.90.

## Definition of Done
- [ ] Tinseth + Rager implémentés, interface conforme §4.6
- [ ] Règles par `use` respectées (dry_hop=0, whirlpool réduit, etc.)
- [ ] **Validation Tinseth** : 28 g @ 6 % alpha, 60 min, boilGravity 1.050, batch 20 L → ≈ **22 IBU** (±1)
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-04}} — Bloque : {{M1-12}}
