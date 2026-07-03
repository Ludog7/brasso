---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-08 — core : empâtage & eau (strike, sparge, infusion)

## Contexte
FORMULES-BRASSICOLES.md §6. Ces calculs alimentent le profil matériel & moteur thermique (M3) et la State Machine Jour J (temps de montée, strike temp).

## Objectif
`strikeWaterTemp`, `mashWaterVolume`, `spargeVolume` et correction de palier implémentés et validés.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/mash.ts`, tests.
- Hors périmètre explicite : state machine (M1-13), profils d'équipement (M3).

## Spécification (FORMULES §6)
- Eau d'empâtage : `mashWaterVolume(grainKg, ratio)` = `ratioLkg × masseGrainsKg` (défaut `DEFAULT_MASH_RATIO=3.0`, borne 2.5–4.0).
- Eau de rinçage : `spargeVolume = volPreBoil + absorption + pertesMort − eauEmpatage`, `absorption = GRAIN_ABSORPTION × grainKg`.
- Strike temp : `Tstrike = (0.41/R) × (Tcible − Tgrain) + Tcible` (`MASH_HEAT_RATIO=0.41`).
- Correction de palier (infusion eau bouillante) : formule §6.4.

## Definition of Done
- [ ] 4 fonctions implémentées, interfaces conformes §11
- [ ] Test de cohérence strike temp (ex. ratio 3, cible 66 °C, grain 20 °C → valeur plausible)
- [ ] Sparge et infusion testés
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-03}} — Bloque : {{M1-13}}
