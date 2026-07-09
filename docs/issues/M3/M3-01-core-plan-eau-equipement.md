---
labels: core, feature, P0
milestone: M3 — Équipements & batchs
---
# M3-01 — core : plan d'eau & volumes d'équipement

## Contexte
Planifier un batch exige de dériver, depuis une recette et un **profil d'équipement**, les volumes d'eau réels (empâtage, rinçage, total) et la température de chauffe. `packages/core` porte déjà les primitives d'empâtage (M1-08 : `mashWaterVolume`, `strikeWaterTemp`, `spargeVolume`, `infusionVolume`, `FORMULES §6`). M3 les **assemble** avec les pertes d'un équipement (deadspace, absorption grain, évaporation, transfert). `docs/FORMULES-BRASSICOLES.md` fait foi.

## Objectif
`@brasso/core` expose une fonction pure `computeBrewWaterPlan(input)` qui produit le plan d'eau complet d'un brassage (volumes + strike temp) à partir des grains, du volume visé et des paramètres d'équipement.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/equipment/*` (nouveau), `packages/core/tests/`, export depuis `src/index.ts`.
- Réutilise `formulas/mash.ts` (aucune formule réécrite) ; unités internes (g, L, °C).
- Hors périmètre explicite : chimie de l'eau / sels (M3-02), persistance & API (M3-03/04), UI (M3-08).

## Spécification
- Entrée `BrewWaterPlanInput` (unités internes) : `grainKg`, `batchVolumeL`, `boilTimeMin`, `mashRatioLPerKg?`, `targetMashTempC?`, `grainTempC?`, et un `EquipmentParams` = `{ deadspaceL, transferLossL, evaporationRateLPerHour, grainAbsorptionLPerKg, nominalVolumeL? }`.
- Sortie `BrewWaterPlan` : `mashWaterL`, `spargeWaterL`, `totalWaterL`, `preBoilVolumeL`, `postBoilVolumeL`, `evaporationLossL`, `grainAbsorptionLossL`, `strikeTempC?` (si `targetMashTempC`/`grainTempC` fournis).
- Règles : `evaporationLossL = evaporationRateLPerHour × boilTimeMin/60` ; `preBoilVolumeL = postBoilVolumeL + evaporationLossL` ; `spargeWaterL` via `spargeVolume` (déjà : `preBoil + absorption + deadspace − mashWater`). Garde-fous : volumes négatifs → `0` avec drapeau, `nominalVolumeL` dépassé → indicateur `overCapacity` (non bloquant).
- **Aucune** grandeur calculée n'est stockée : `computeBrewWaterPlan` reste pure et re-dérivable (ADR-03).

## Definition of Done
- [ ] Tests : plan d'eau validé contre au moins un cas de référence `FORMULES §6` (empâtage + rinçage + évaporation), cas limites (grain 0, volume nul → garde-fous)
- [ ] Couverture `core` ≥ 90 % maintenue
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : pour un grist et un profil d'équipement donnés, `computeBrewWaterPlan` renvoie des volumes d'empâtage/rinçage/total cohérents avec le calcul manuel de référence

## Dépendances
Bloqué par : {{M1-08}} — Bloque : {{M3-08}}
