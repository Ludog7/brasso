---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-14 — core : schémas Zod partagés + gate de couverture ≥ 90 %

## Contexte
ADR-04 (Zod partagé dans `core`) et exigence transverse §6 (couverture core ≥ 90 %). Clôture M1 : expose les schémas de validation réutilisés par l'API/front et verrouille la qualité du package `core`.

## Objectif
`packages/core/src/schemas/` exporte les schémas Zod (recette par moteur, batch, stock, mesures) ; la CI échoue si la couverture `core` passe sous 90 %.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/schemas/*`, config Vitest coverage, branchement CI (M0-09).
- Hors périmètre explicite : schémas API-only, DTO front spécifiques.

## Spécification
- Schémas Zod partagés : recette (discriminée par `engine`, avec contrainte `stabilizationMethod` requise pour ALT publiée — cohérent M1-12), batch, mesures (gravity/temp/ph/volume), stock (catalog/lot/movement/reservation). Types inférés exportés.
- Config Vitest : couverture (statements/branches/functions/lines) sur `packages/core`, seuil **90 %**.
- Gate CI : le job de test échoue si le seuil n'est pas atteint (relie M0-09).
- Vérifier la cohérence des schémas avec le modèle Prisma (M1-01) sur les champs partagés.

## Definition of Done
- [ ] Schémas Zod partagés exportés depuis `@brasso/core`
- [ ] Discriminated union par `engine` ; contrainte stabilisation ALT présente
- [ ] Couverture `core` ≥ 90 % mesurée et **imposée par la CI** (build rouge si en-dessous)
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : suite core verte + rapport de couverture ≥ 90 % (critère de démo M1)

## Dépendances
Bloqué par : {{M1-12}}, {{M1-13}} — Bloque : —
