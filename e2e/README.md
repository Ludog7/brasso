# Tests E2E (Playwright)

Socle end-to-end des **parcours critiques** (SPEC-ORCHESTRATION §4/§6). Les tests
tournent contre l'**app réelle** : front Vite + API Fastify + PostgreSQL.

## Ce que fait le socle

- `fixtures/global-setup.ts` **réinitialise** la base ciblée (`prisma migrate
reset`, rejoue le seed de base) puis amorce les données de parcours
  (`fixtures/seed-e2e.ts` : comptes par rôle, équipement, recette publiée, stock).
- `playwright.config.ts` démarre l'API (`tsx`) et le front (Vite, proxy même
  origine) sur des **ports dédiés E2E** (API `3100`, web `4173`) puis pilote un
  navigateur chromium en cible tablette.
- `helpers/auth.ts` → `loginAs(page, role)` (admin / brasseur / caisse).
- `tests/brassage.spec.ts` → parcours **boucle brassin complète** (M9-14) :
  recette publiée → batch → Jour J intégral (filtration, assainissement du
  circuit, whirlpool, refroidissement) → durées prévisionnelles et jalons datés
  → vue Brassins → conditionnement → stock de produits finis affichable au bar.

### Budget de temps

Le parcours brassin dure **~1 min 05**, dont **60 s d'attente réelle** sur le
palier d'assainissement du circuit. Ce n'est pas une temporisation : le test
attend que le bouton « Valider l'étape » s'active.

Cette minute est un **plancher**. La durée d'ébullition (`timeMin`) et le délai
d'assainissement (`Settings.coolingCircuitSanitizeLeadMin`) sont des **entiers
de minutes** ; le palier le plus court qu'on puisse produire dure donc une
minute. La recette de parcours est déjà calée dessus (cf. `BOIL_TIME_MIN` dans
`fixtures/seed-e2e.ts`) — inutile de chercher à la raccourcir sans changer ces
types.

## Lancer en local (Windows / PowerShell)

⚠️ `global-setup` **réinitialise** la base ciblée : viser une base **jetable**,
jamais la base de dev.

```bash
# 1. Créer une base de test dédiée (Postgres dev sur le port 5433) :
docker exec -it brasso-dev-postgres-1 createdb -U brasso brasso_e2e

# 2. Pointer l'E2E dessus (adapter le mot de passe à votre .env) :
export E2E_DATABASE_URL="postgresql://brasso:<motdepasse>@localhost:5433/brasso_e2e"

# 3. Installer le navigateur (une fois) puis lancer :
pnpm --filter @brasso/e2e exec playwright install chromium
pnpm test:e2e
```

Variables surchargeables : `E2E_DATABASE_URL`, `E2E_SESSION_SECRET`,
`E2E_API_PORT`, `E2E_WEB_PORT`, `E2E_BASE_URL` (cf. `fixtures/env.ts`).

## CI

Le job `e2e` (`.github/workflows/ci.yml`) démarre un service Postgres
(`brasso_test`), construit le monorepo, installe chromium et lance `pnpm
test:e2e`. Les artefacts (trace/vidéo/rapport HTML) sont conservés **à l'échec**.
