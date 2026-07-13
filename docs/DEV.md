# Brasso — manuel du développeur

> **Démarrer ici à chaque reprise de dev.** Ce fichier porte le *comment on
> navigue / build / teste* le projet. Il **complète** :
>
> - `CLAUDE.md` → les **règles** non négociables (ADR, conventions, wording).
> - `docs/SPEC-ORCHESTRATION.md` → cadrage, ADR détaillés, milestones.
> - `docs/SPEC-FONCTIONNELLE.md` / `docs/FORMULES-BRASSICOLES.md` → le métier.
> - Les mémoires `brasso-avancement-M*` → l'**état d'avancement** courant.
>
> But : réduire le « coût d'orientation » (commandes, carte, config) à chaque
> reprise. Il ne remplace pas la lecture du code qu'on modifie, il y mène vite.

## Reprise en 30 secondes

1. `git log --oneline -5` + `git status` — où on en est.
2. Ouvrir le **corps du ticket** courant dans `docs/issues/M<n>/`.
3. Lire la **mémoire d'avancement** du milestone (`brasso-avancement-M<n>`) : ce
   qui est mergé, le prochain ticket, les points d'appui.
4. Brancher : `feat/<n°issue>-<slug>` (voir [Flux de contribution](#flux-de-contribution)).

## Stack (versions clés)

| Couche | Techno | Détail |
| --- | --- | --- |
| Runtime | **Node 22 LTS**, **pnpm 10** workspaces, **turborepo** | `package.json:engines` |
| API | **Fastify 5** + **Zod 3**, Argon2id, `@fastify/{cookie,cors,helmet,rate-limit,sensible}` | `apps/api` |
| DB | **Prisma 6** + **PostgreSQL 16** | `packages/db` |
| Web | **React 18** + **Vite 5** + **Tailwind 4** + shadcn/ui, **TanStack Query 5**, **Zustand 5**, react-router 6, `vite-plugin-pwa` | `apps/web` |
| Core | TS pur (zéro dep UI/DB), Zod, `fast-xml-parser` (BeerXML) | `packages/core` |
| Tests | **Vitest** partout. E2E Playwright : **prévu** (spec §1), pas encore câblé. | |
| Infra | Docker Compose (app + postgres + caddy), Caddy (TLS auto) | `docker-compose*.yml`, `Caddyfile` |

Détail complet : `SPEC-ORCHESTRATION.md` §1.

## Carte du repo

```
apps/
  api/   Fastify. src/modules/<domaine>/ = { routes, service, repository, schema }.ts
         src/plugins/ (auth, config, errorHandler, rbac) · src/rbac/matrix.ts (RBAC deny-by-default)
         Modules : auth · recipes · batches · equipment · referentials · health
  web/   React/Vite. src/features/<domaine>/ (logique + composants) · src/routes/ (pages)
         src/lib/ (api.ts, queryClient, utils) · src/stores/ (Zustand) · src/hooks/ · src/ui/ (shadcn)
packages/
  core/  Métier PUR (ADR-03). Modules : units.ts · formulas/ · engines/ · schemas/ (Zod)
         stateMachine/ (Jour J) · reference/ · beerxml/ · interchange/ · equipment/ · water/
  db/    Prisma. prisma/schema.prisma · prisma/migrations/ · seed/ · scripts db:*
docs/    Specs, ADR (adr/), issues/M*/, patterns/, ce fichier
```

**Pattern module API** : une route déclare son couple (ressource, action) RBAC ;
`schema.ts` (Zod, souvent importé de `@brasso/core`) → `routes.ts` → `service.ts`
(règles) → `repository.ts` (Prisma, interface injectable pour tests en mémoire).

## Setup local (une fois)

```bash
cp .env.example .env          # puis renseigner (voir commentaires du fichier)
pnpm install                  # postinstall : prisma generate
docker compose -f docker-compose.dev.yml up -d   # Postgres local (port 5432)
pnpm --filter @brasso/db db:migrate               # applique les migrations
pnpm --filter @brasso/db db:seed                  # données de démo + admin (M1-02)
```

`.env` est **gitignoré** ; les secrets ne vivent qu'en variables d'env. L'API et
le seed lisent la racine via `--env-file=../../.env`.

## Commandes du quotidien

| But | Commande |
| --- | --- |
| Tout (turbo) | `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm dev` |
| Un package | `pnpm --filter @brasso/<core\|db\|api\|web> <script>` |
| **Core + couverture** | `pnpm --filter @brasso/core test:coverage` |
| API en watch | `pnpm --filter @brasso/api dev` |
| Web en watch | `pnpm --filter @brasso/web dev` |
| Format (avant push) | `pnpm format` (écrit) · `pnpm format:check` (CI) |
| Prisma | `db:migrate` (dev) · `db:deploy` (prod) · `db:seed` · `db:reset` · `db:studio` · `db:generate` |

## Pipeline CI

`.github/workflows/ci.yml`, check requis **`ci`**, service Postgres 16. Étapes **dans
l'ordre** (reproductibles en local pour éviter un aller-retour) :

1. `pnpm install --frozen-lockfile`
2. `pnpm format:check` ← **Prettier** (voir piège CRLF ci-dessous)
3. `pnpm lint` ← ESLint 9 flat + `simple-import-sort`
4. `pnpm typecheck` ← `tsc --noEmit`
5. `pnpm test` ← Vitest. **Gate couverture `core` ≥ 90 %** (lines/branches/functions/statements) via `packages/core/vitest.config.ts`
6. `pnpm build`

`main` est protégée : merge par PR uniquement, **CI verte**, **squash** only.

## Flux de contribution

1. **Un ticket = une branche = une PR.** Jamais de commit direct sur `main`.
2. Branche `feat/<n°issue>-<slug>` (ex. `feat/102-core-plan-jourj-schemas`).
3. PR : remplir le template (`.github/pull_request_template.md`), `Closes #<n>`.
4. CI verte → **squash merge** + suppression de branche (`gh pr merge <n> --squash --delete-branch`).
5. Un bug hors périmètre = un ticket `type:bug` sur le milestone courant, jamais de fix silencieux.

## Pièges connus

- **CRLF / Windows** : `core.autocrlf=true` fait échouer `pnpm format:check` **en
  local** (repo LF, CI verte). Vérifier ses fichiers ciblés :
  `npx prettier --check "<glob des fichiers touchés>"`. **Formater TOUS les
  fichiers touchés** (API *et* web *et* core) — une CI a déjà cassé pour un
  fichier API oublié.
- **`recipeSnapshot`** = `JSON.parse(JSON.stringify(RecipeWithDetails))` figé sur
  le batch (JSONB immuable). `steps` = `[{ type, name?, params, sortOrder }]` où
  `params` est validé par `stepParamsSchemaByType[type]` (core `schemas/recipeParts.ts`).
- **Unités** : toute conversion vit dans `packages/core/src/units.ts`, nulle part
  ailleurs (g, L, °C, SG brute, EBC, α en fraction, centimes).
- **Recette `PUBLISHED` immuable** (ADR-06/07) : l'éditer crée un `DRAFT` v n+1.
- **Wording ADR-11** (écrans pH/stabilisation/corrections) : « **indicateur**
  d'aide à la décision », jamais « conforme »/« sûr ».
- **Migration Prisma mergée = jamais modifiée** → nouvelle migration.

## Ancrages d'architecture (évitent de fouiller le code)

- **`core` est pur** (ADR-03) : aucune dépendance DB/UI, déterministe, testé
  isolément. Les schémas **Zod vivent dans `core`** (ADR-04) et **recopient** les
  enums Prisma (valeurs, pas d'import) — toute divergence est un bug.
- **Cycle recette → brassin → Jour J** :
  `recette PUBLISHED` → `batch` fige `recipeSnapshot` →
  `buildDayPlan(snapshot, equipment)` → `DayPlan` → `initDayState` →
  `transition(state, event)` **pur, serveur autoritaire** (ADR-08) →
  `phaseToDayPhase` pour la persistance (`DayPhase` Prisma).
- **RBAC deny-by-default** : matrice (ressource, action) dans `apps/api/src/rbac/matrix.ts`.
```
