# Brasso — mémoire projet

> Plateforme de gestion de microbrasserie associative. Ce fichier pilote **toutes** les sessions Claude Code sur ce repo. Lis-le en entier avant d'agir.

## Règles non négociables

- **Lis `docs/SPEC-ORCHESTRATION.md` avant toute implémentation.** Les ADR (section 0) sont **figés** : toute remise en cause passe par un ticket `type:adr` + un fichier dans `docs/adr/`.
- **Formules brassicoles : `docs/FORMULES-BRASSICOLES.md` fait foi.** Jamais de formule écrite de mémoire. En cas de divergence code ↔ document, le document gagne.
- **Spec métier : `docs/SPEC-FONCTIONNELLE.md`.** Elle décrit le comportement attendu ; l'orchestration décrit comment on le construit.
- **Un ticket = une branche = une PR.** Jamais de commit direct sur `main`. Branche : `feat/<n°issue>-<slug>` (ex. `feat/42-state-machine-timers`). PR avec template rempli et `Closes #42`.
- **`main` est protégée** : merge uniquement par PR avec CI verte (lint + tests + build). Squash merge.
- **Tests obligatoires** pour tout code dans `packages/core`. **Couverture ≥ 90 %.** Chaque formule est validée contre les valeurs de référence de `FORMULES-BRASSICOLES.md`.
- **Un bug découvert = un ticket `type:bug`** rattaché au milestone courant. Jamais de fix silencieux hors périmètre du ticket en cours.

## Conventions techniques

- **Unités internes** (stockage + calcul) : gramme (g), litre (L), °C, SG brute (`1.052`), EBC, acides alpha en **fraction** (`0.062`), bar, centimes pour la monnaie. **Toutes** les conversions vivent dans `packages/core/src/units.ts` — nulle part ailleurs.
- **Wording sécurité alimentaire (ADR-11)** : sur les écrans pH/stabilisation, dire « **indicateur** d'aide à la décision », **jamais** « conforme » / « sûr ». Disclaimer permanent imposé (voir ADR-11).
- **Migrations Prisma** : ne **jamais** modifier une migration déjà mergée → créer une nouvelle migration.
- **Recettes** : une recette `PUBLISHED` est immuable ; l'éditer crée un `DRAFT` version n+1 (ADR-06/07). Un batch fige `recipeSnapshot` (JSONB).
- **RBAC deny-by-default** : toute route API déclare son couple (ressource, action). Voir la matrice §3.5 de la spec.
- **Sécurité** : Argon2id, cookies `httpOnly/secure/sameSite`, rate-limit login + webhooks, secrets uniquement en variables d'environnement, webhooks vérifiés par signature.

## Poste de pilotage

- L'ordinateur de Ludo est sous **Windows / PowerShell**. Les scripts d'automatisation (CI, conteneurs, amorçage) sont fournis en **bash compatible Git Bash**.

## Stack (rappel — détail dans SPEC-ORCHESTRATION §1)

Node 22 LTS · pnpm workspaces + turborepo · Fastify 5 + Zod · Prisma 6 + PostgreSQL 16 · React 18 + Vite + Tailwind 4 + shadcn/ui · TanStack Query · Zustand + IndexedDB · Vitest + Playwright · ESLint 9 flat + Prettier · Docker Compose (app + postgres + caddy).

## Où trouver quoi

- Cadrage & ADR & milestones : `docs/SPEC-ORCHESTRATION.md`
- Formules `core` + valeurs de validation : `docs/FORMULES-BRASSICOLES.md`
- Spec fonctionnelle métier : `docs/SPEC-FONCTIONNELLE.md`
- Corps des tickets : `docs/issues/M*/`
- Amorçage GitHub (labels/milestones/issues) : `scripts/bootstrap-issues.sh`
