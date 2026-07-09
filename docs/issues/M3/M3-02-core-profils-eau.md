---
labels: core, feature, P1
milestone: M3 — Équipements & batchs
---
# M3-02 — core : profils d'eau (chimie brassicole indicative)

## Contexte
Un profil d'équipement porte une **analyse d'eau réseau** de base et des **cibles par style** (SPEC-FONCTIONNELLE « Équipement » : « Profil d'eau de base + profils cibles par style »). `packages/core` doit modéliser ces profils et proposer des ajustements **indicatifs** de sels/acides. Wording sécurité/qualité : aide à la décision, jamais prescriptif. `docs/FORMULES-BRASSICOLES.md` fait foi pour toute constante.

## Objectif
`@brasso/core` expose le schéma Zod d'un profil d'eau (ions en mg/L) et une fonction pure qui, d'un profil de base + un profil cible, dérive des **suggestions** d'ajouts de sels brassicoles usuels et l'écart ionique résiduel.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/water/*` (nouveau), `packages/core/tests/`, export `src/index.ts`.
- Hors périmètre explicite : persistance des profils sur `EquipmentProfile.waterProfiles` (M3-03 branche ce schéma), UI (M3-07), volumes d'eau (M3-01).

## Spécification
- Schéma Zod `waterProfileSchema` : ions `{ calcium, magnesium, sodium, sulfate, chloride, bicarbonate }` en mg/L (≥ 0), `name?`. Enveloppe `equipmentWaterProfiles` = `{ base?: WaterProfile, targetsByStyle?: Record<styleKey, WaterProfile> }` — c'est la forme stockée dans `EquipmentProfile.waterProfiles` (JSONB, ADR-04).
- Sels supportés (constantes issues de `FORMULES-BRASSICOLES.md` / annexe eau) : gypse (CaSO₄), chlorure de calcium (CaCl₂), sel d'Epsom (MgSO₄), sel de table (NaCl), bicarbonate de sodium. `suggestWaterAdditions(base, target, volumeL)` → doses (g) **indicatives** minimisant l'écart, + `residualDelta` (mg/L par ion) + ratio sulfate/chlorure.
- Aucune allégation « conforme »/« potable » : la sortie est un **indicateur** d'aide à la décision (cohérent ADR-11).

## Definition of Done
- [ ] Tests : round-trip du schéma, suggestion validée contre au moins un cas de référence (base → cible connue), ratio sulfate/chlorure correct
- [ ] Couverture `core` ≥ 90 % maintenue
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : un profil de base et une cible produisent des doses de sels et un écart résiduel reproductibles

## Dépendances
Bloqué par : {{M1-03}} — Bloque : —
