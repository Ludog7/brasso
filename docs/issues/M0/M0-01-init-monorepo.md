---
labels: infra, chore, P0
milestone: M0 — Socle
---
# M0-01 — Init monorepo pnpm workspaces + turborepo + TypeScript

## Contexte
Premier ticket exécutable du projet (SPEC-ORCHESTRATION §8.3). Pose le squelette monorepo TypeScript décrit dans l'ADR-03 et la structure de repo §2. Aucune brique fonctionnelle ici : uniquement l'ossature qui rend les tickets suivants exécutables.

## Objectif
`pnpm install` puis `pnpm -r build` / `pnpm -r lint` fonctionnent sur un monorepo vide mais correctement câblé (workspaces + turborepo + TS project references + ESLint/Prettier).

## Périmètre technique
- Fichiers/dossiers concernés :
  - `package.json` racine (privé, `packageManager: pnpm`), `pnpm-workspace.yaml`, `turbo.json`
  - `tsconfig.base.json` racine + `tsconfig.json` par package
  - `packages/core`, `packages/db`, `apps/api`, `apps/web` : `package.json` + `src/index.ts` minimal (placeholder exporté)
  - ESLint 9 flat config (`eslint.config.js`) + `.prettierrc` + `.prettierignore` + `.editorconfig`
  - `.nvmrc` (Node 22)
- Hors périmètre explicite : contenu métier des packages, Docker (M0-03), Prisma (M0-04), CI (M0-09).

## Spécification
- Node 22 LTS, pnpm workspaces, turborepo (ADR-03, §1). Scripts racine : `build`, `lint`, `test`, `typecheck`, `dev` délégués à turbo.
- `packages/*` et `apps/*` déclarés dans `pnpm-workspace.yaml`.
- Nommage packages : `@brasso/core`, `@brasso/db`, `@brasso/api`, `@brasso/web`.
- TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`) dans `tsconfig.base.json`, hérité partout.
- ESLint 9 flat + Prettier ; règle : pas d'`any` implicite, imports triés.
- `packages/core` a **zéro dépendance UI/DB** (ADR-03/§2) — vérifiable : son `package.json` ne dépend ni de prisma ni de react.

## Definition of Done
- [ ] `pnpm install` OK sur une clean install
- [ ] `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build` verts (packages vides)
- [ ] Structure conforme à SPEC-ORCHESTRATION §2
- [ ] Lint + CI verte (une fois M0-09 en place)
- [ ] Critère fonctionnel observable : arbre monorepo présent, 4 packages résolus par pnpm

## Dépendances
Bloqué par : — — Bloque : {{M0-03}}, {{M0-04}}, {{M0-05}}, {{M0-08}}, {{M0-09}}
