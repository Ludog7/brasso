---
labels: core, feature, P1
milestone: M1 — Modèle & core
---
# M1-10 — core : carbonatation (priming, keg PSI, CO₂ résiduel)

## Contexte
FORMULES-BRASSICOLES.md §8. Sert au conditionnement (bière) et au suivi du risque de carbonatation résiduelle des boissons ALT (surpression bouteille — garde-fou sécurité, spec métier).

## Objectif
`primingSugar`, `kegPressurePsi`, `residualCo2` implémentés et validés.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/carbonation.ts`, tests.
- Hors périmètre explicite : logique d'alerte surpression (moteur ALT — M1-12), UI.

## Spécification (FORMULES §8)
- `residualCo2(tempC)` : `3.0378 − 0.050062×Tf + 0.00026555×Tf²` (Tf en °F, T max atteinte).
- `primingSugar(volumeL, co2Target, maxTempC, sugar)` : `gSucre = volumeL × (CO2cible − CO2résiduel) × 3.9`, facteurs sucre : sucrose 1.00, dextrose ≈1.10, DME ≈1.47.
- `kegPressurePsi(co2Target, tempC, altitudeFt)` : régression §8.2 + correction altitude (+0.5 PSI / 1000 ft). Sortie PSI (conversion bar via units).

## Definition of Done
- [ ] 3 fonctions implémentées, interfaces conformes §8.4
- [ ] **Validation** : 5 °C (41 °F), 2,4 vol → ≈ **11 PSI** ; 19 L à 2,4 vol refroidi à 4 °C → priming saccharose ≈ **100–110 g**
- [ ] Facteurs sucre testés (sucrose/dextrose/DME)
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-03}} — Bloque : {{M1-12}}
