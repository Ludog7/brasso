---
labels: infra, feature, P0
milestone: M0 — Socle
---
# M0-09 — CI GitHub Actions (lint + test + build sur PR)

## Contexte
SPEC-ORCHESTRATION §5.4 : `main` protégée, merge uniquement par PR avec CI verte (lint, tests, build). §1 : CI = GitHub Actions. Critère de démo M0 : « CI verte ».

## Objectif
Toute PR vers `main` déclenche un workflow qui exécute lint + typecheck + tests + build sur le monorepo et doit être vert pour merger.

## Périmètre technique
- Fichiers/dossiers concernés :
  - `.github/workflows/ci.yml`
  - Éventuel service `postgres` dans le job pour les tests d'intégration API
- Hors périmètre explicite : déploiement/CD (M8), E2E Playwright (M8).

## Spécification
- Déclencheurs : `pull_request` vers `main` (+ `push` sur `main` pour le badge).
- Node 22, pnpm avec cache ; turborepo pour paralléliser.
- Étapes : install → `lint` → `typecheck` → `test` (avec service postgres 16 pour l'API/DB) → `build`.
- Couverture `core` : la CI échoue si < 90 % (gate branché quand M1-14 le fournit).
- Concurrence : annule les runs obsolètes d'une même PR.

## Definition of Done
- [ ] Workflow s'exécute sur PR, étapes lint/typecheck/test/build présentes
- [ ] Service postgres disponible pour les tests d'intégration
- [ ] Échec réel si lint/test cassé (vérifié)
- [ ] Documenté pour brancher la protection de branche `main`
- [ ] Critère fonctionnel observable : une PR de démonstration passe au vert

## Dépendances
Bloqué par : {{M0-01}} — Bloque : —
