# Brasso

> Plateforme de gestion d'une **microbrasserie associative** : recettes, brassins,
> Jour J, stocks, membres/RGPD, hub caisse et affichage — pensée pour un usage
> atelier sur tablette, avec un fonctionnement **hors ligne** le jour du brassage.

**Statut : les 8 milestones (M0 → M8) sont livrés.** Le projet est prêt pour la
mise en production, sous réserve de la levée de deux gates réglementaires externes
(voir [Go-live](#go-live)).

## Avancement par milestone

| Milestone                            | Périmètre                                                                                                                                                                                                                    | Statut     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **M0** — Socle                       | Docker Compose + CI, authentification (Argon2id, sessions), RBAC deny-by-default, shell front                                                                                                                                | ✅ Complet |
| **M1** — Core                        | Unités, formules brassicoles, 3 moteurs (BEER/ALT/SOFT), state machine Jour J, schémas Zod — **couverture 100 %** imposée en CI                                                                                              | ✅ Complet |
| **M2** — Recettes                    | CRUD + versioning, 3 éditeurs temps réel, portabilité BeerXML / JSON                                                                                                                                                         | ✅ Complet |
| **M3** — Équipements & batchs        | Profils d'équipement/eau, planification de brassins                                                                                                                                                                          | ✅ Complet |
| **M4** — Jour J                      | State machine tolérante, **PWA offline** (file d'actions rejouée à la reconnexion)                                                                                                                                           | ✅ Complet |
| **M5** — Stocks complets             | Décrément au volume réel, coût de revient                                                                                                                                                                                    | ✅ Complet |
| **M6** — Membres & RGPD              | Adhésions, cotisations HelloAsso (webhook **HMAC**), statut dérivé, outils RGPD                                                                                                                                              | ✅ Complet |
| **M7** — Hub caisse & affichage      | SumUp/Zettle (webhooks signés), rapprochement vente→stock, anomalies, écran bar temps réel, exports CSV                                                                                                                      | ✅ Complet |
| **M8** — Durcissement & mise en prod | Calculateurs d'atelier, sauvegardes `pg_dump` + restauration testée, runbooks, **E2E Playwright** (4 parcours critiques, bloquants en CI), perf tablette (code-splitting / budget / PWA), gates réglementaires REG-01/REG-02 | ✅ Complet |

Détail du **dernier milestone (M8)** : les 9 sous-tickets sont mergés (calculateurs
autonomes, sauvegarde/restauration vérifiée, runbooks d'exploitation, socle E2E +
4 parcours critiques, durcissement perf tablette, dossiers REG-01/REG-02), et
3 bugs révélés par le durcissement ont été corrigés (POST sans corps, rapprochement
bloqué par un trigger append-only, routage Caddy `/auth` `/health` `/webhooks`).

## Stack

Node 22 · pnpm workspaces + turborepo · Fastify 5 + Zod · Prisma 6 + PostgreSQL 16 ·
React 18 + Vite + Tailwind 4 + shadcn/ui · TanStack Query · Zustand + IndexedDB ·
Vitest + Playwright · ESLint 9 + Prettier · Docker Compose (app + postgres + caddy).

## Structure du dépôt

```
apps/
  api/        API Fastify (modules métier, RBAC, webhooks signés)
  web/        Front React (Vite, PWA offline, éditeurs de recette, Jour J)
packages/
  core/       Domaine pur : unités, formules, moteurs, state machine, schémas Zod
  db/         Schéma Prisma + migrations + seed
e2e/          Tests end-to-end Playwright (parcours critiques)
docs/         Spécifications, formules, runbooks, dossiers réglementaires
scripts/      Amorçage GitHub, sauvegardes
```

## Démarrage rapide

Prérequis : Node ≥ 22, pnpm 10, Docker (PostgreSQL). Manuel complet dans
[`docs/DEV.md`](docs/DEV.md).

```bash
pnpm install                 # dépendances (workspace)
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL local
pnpm --filter @brasso/db db:deploy               # migrations
pnpm --filter @brasso/db db:seed                 # données de démo
pnpm dev                     # API + web en watch
```

### Commandes utiles

| Commande                                     | Rôle                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm build` / `pnpm dev`                    | Build / développement (turborepo)                                          |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | Lint · types · tests unitaires (Vitest)                                    |
| `pnpm test:e2e`                              | Tests end-to-end Playwright (prérequis : [`e2e/README.md`](e2e/README.md)) |
| `pnpm format` / `pnpm format:check`          | Prettier                                                                   |

## Documentation

- [`docs/DEV.md`](docs/DEV.md) — **manuel du développeur** (carte du repo, commandes, pipeline CI, pièges) : point d'entrée pour reprendre le dev.
- [`docs/SPEC-ORCHESTRATION.md`](docs/SPEC-ORCHESTRATION.md) — cadrage, ADR (figés), milestones.
- [`docs/SPEC-FONCTIONNELLE.md`](docs/SPEC-FONCTIONNELLE.md) — spécification métier.
- [`docs/FORMULES-BRASSICOLES.md`](docs/FORMULES-BRASSICOLES.md) — formules `core` + valeurs de référence (fait foi).
- [`docs/RUNBOOKS.md`](docs/RUNBOOKS.md) — exploitation : installation from scratch, restauration, incidents.
- [`docs/regulatory/`](docs/regulatory/) — dossiers réglementaires REG-01 (NF525) et REG-02 (pH/HACCP).
- [`CLAUDE.md`](CLAUDE.md) — règles non négociables et conventions du projet.

## Go-live

La mise en production est conditionnée à deux **gates réglementaires** instruits en
M8 mais dépendant d'une **validation externe** :

- **REG-01 — frontière NF525** : confirmation par un expert-comptable que le hub
  caisse _read-only_ n'entre pas dans le champ des logiciels de caisse
  ([`docs/regulatory/REG-01-nf525.md`](docs/regulatory/REG-01-nf525.md)).
- **REG-02 — relecture pH / HACCP** : relecture du wording et de la logique
  d'alerte pH/stabilisation par une personne compétente en hygiène alimentaire
  ([`docs/regulatory/REG-02-ph-haccp.md`](docs/regulatory/REG-02-ph-haccp.md)).

Chaque dossier porte une section de traçabilité à renseigner avant le déploiement.

## Contribution

Un ticket = une branche = une PR. `main` est protégée (merge par PR avec CI verte,
squash only). Conventions détaillées dans [`CLAUDE.md`](CLAUDE.md) et
[`docs/DEV.md`](docs/DEV.md).
