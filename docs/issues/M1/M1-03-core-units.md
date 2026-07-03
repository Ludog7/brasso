---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-03 — core/units.ts : conversions + constantes de référence

## Contexte
FORMULES-BRASSICOLES.md §0 (conventions d'unités) + Annexe B (constantes). ADR : **toutes** les conversions vivent dans `core/units.ts`, nulle part ailleurs (CLAUDE.md). Fondation de tous les autres modules core.

## Objectif
`packages/core/src/units.ts` expose toutes les conversions et constantes du référentiel, testées contre les définitions du §0.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/units.ts`, `packages/core/tests/units.test.ts`.
- Hors périmètre explicite : formules métier (tickets suivants).

## Spécification (FORMULES §0.1 + Annexe B)
- Conversions : `gToKg`, `gToLb` (/453.592), `lToGal` (/3.78541), `cToF`, `fToC`, `points(sg)`, `sgFromPoints`, `sgToPlato`/`platoToSg` (polynômes §0.1), `srmToEbc` (×1.97), `ebcToSrm`, `psiToBar` (×0.0689476), `barToPsi`.
- Constantes (Annexe B) : `WCF_DEFAULT=1.04`, `ABV_FACTOR=131.25`, `PRIMING_SUCROSE=3.9`, `MASH_HEAT_RATIO=0.41`, `DEFAULT_EFFICIENCY=72`, `DEFAULT_MASH_RATIO=3.0`, `GRAIN_ABSORPTION=1.0`.
- Acides alpha manipulés en **fraction** (jamais %), densité en SG brute.

## Definition of Done
- [ ] Toutes les fonctions/constantes du §0.1 + Annexe B présentes et typées
- [ ] Tests unitaires : chaque conversion vérifiée (aller-retour + valeur connue)
- [ ] Aucune conversion dupliquée ailleurs dans le monorepo
- [ ] Couverture core ≥ 90 % sur ce module
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M0-01}} — Bloque : {{M1-04}}, {{M1-05}}, {{M1-06}}, {{M1-07}}, {{M1-08}}, {{M1-09}}, {{M1-10}}, {{M1-11}}
