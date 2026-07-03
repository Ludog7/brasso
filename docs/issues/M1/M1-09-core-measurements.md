---
labels: core, feature, P1
milestone: M1 — Modèle & core
---
# M1-09 — core : mesures densimètre + réfractomètre (Terrill)

## Contexte
FORMULES-BRASSICOLES.md §7. Utilisé lors des mesures Jour J et du journal de fermentation pour corriger les lectures (température, alcool).

## Objectif
`hydrometerTempCorrect`, `refractoOgFromBrix`, `refractoFgCorrected` implémentés, Terrill cubique par défaut, validés.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/measurements.ts`, tests.
- Hors périmètre explicite : saisie UI, stockage batch.

## Spécification (FORMULES §7)
- Correction densimètre en température (§7.1) : polynôme de correction (T en °F, calibration 20 °C).
- Réfractomètre moût non fermenté (§7.2) : `BrixRéel = BrixLu / WCF` (`WCF_DEFAULT=1.04`), `SG = platoToSg(BrixRéel)`. WCF réglable.
- Réfractomètre après fermentation (§7.3) : Terrill **cubique par défaut**, exposer `cubic|linear|simple`. Interface §7.4.

## Definition of Done
- [ ] 3 fonctions implémentées, WCF réglable, méthode sélectionnable
- [ ] **Validation Terrill cubique** : OB 12,0 °Bx / FB 6,5 °Bx / WCF 1.04 → FG ≈ **1.010** (±0,002)
- [ ] Correction densimètre testée à une T° ≠ calibration
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-03}} — Bloque : —
