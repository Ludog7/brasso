---
labels: db, feature, P0
milestone: M0 — Socle
---
# M0-04 — Prisma init (packages/db) + table `settings` + première migration

## Contexte
ADR-02 (Prisma comme ORM) et ADR-01 : mono-tenant mais **aucune constante métier hardcodée** → table `settings` (nom asso, profils d'eau, TVA…). Ce ticket pose l'infra Prisma et la première migration, sans le schéma métier complet (celui-ci = M1-01).

## Objectif
`pnpm --filter @brasso/db prisma migrate dev` applique une première migration créant la table `Settings` ; le client Prisma est généré et importable.

## Périmètre technique
- Fichiers/dossiers concernés :
  - `packages/db/prisma/schema.prisma` (datasource postgres, generator client, modèle `Settings` + enum minimal)
  - `packages/db/prisma/migrations/` (première migration)
  - `packages/db/src/index.ts` (export d'un `PrismaClient` singleton)
  - `packages/db/package.json` (scripts `db:migrate`, `db:generate`, `db:studio`)
- Hors périmètre explicite : schéma métier complet (M1-01), seed (M1-02).

## Spécification
- IDs `cuid` par défaut partout (ADR-01).
- Modèle `Settings` : clé/valeur typée (ou colonnes dédiées) pour au moins : `assoName`, `tvaRatePpm`, `defaultWaterProfile` (JSONB), `timezone`. Documenté comme extensible.
- Convention : ne jamais modifier une migration mergée (CLAUDE.md) → migrations additives.
- Connexion via `DATABASE_URL` (issue de M0-03).

## Definition of Done
- [ ] `prisma migrate dev` crée la migration et la table `Settings`
- [ ] `prisma generate` produit le client, importable depuis `@brasso/db`
- [ ] Aucune constante métier hardcodée ailleurs que dans `Settings` (ADR-01)
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : `SELECT * FROM "Settings"` fonctionne après migration + seed minimal d'une ligne

## Dépendances
Bloqué par : {{M0-01}}, {{M0-03}} — Bloque : {{M0-05}}, {{M1-01}}
