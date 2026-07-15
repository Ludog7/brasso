---
labels: db, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-01 — db : durée d'adhésion configurable + date de dernière cotisation

## Contexte
Le milestone M6 « Membres & RGPD » rend vivant le modèle **déjà posé en {{M1-01}}** (`Member`, `MemberConsent` append-only, `AuditLog` verrouillé par trigger, `ExternalProvider`/`ExternalTransaction`). Le statut de cotisation (`Member.membership` ∈ `A_JOUR`/`EN_RETARD`) doit être **dérivé d'une période d'adhésion** (décision de cadrage M6-00) et non figé à la main : « à jour » tant que la dernière cotisation date de moins de N jours. Or **ADR-01 interdit toute constante métier hardcodée** — la durée d'adhésion vit donc dans la table `Settings` (mono-tenant), et il faut mémoriser la date de la dernière cotisation rapprochée sur le membre. C'est le **seul** changement de schéma de M6 (tout le reste est déjà en base). SOURCE : `SPEC-ORCHESTRATION.md` §3.4 (Membres/RGPD), ADR-01 (`Settings`).

## Objectif
Le schéma expose une **durée d'adhésion configurable** et une **date de dernière cotisation** par membre, permettant à `core` (M6-02) et à l'API (M6-04/08) de dériver le statut de cotisation.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/db/prisma/schema.prisma` (2 champs), **nouvelle** migration `packages/db/prisma/migrations/<timestamp>_membership_period/migration.sql`, `packages/db/seed/data/settings.ts` (valeur par défaut), régénération du client Prisma.
- Hors périmètre explicite : logique de dérivation (pure → {{M6-02}}), lecture/écriture API ({{M6-04}}, {{M6-08}}), UI. **Ne jamais modifier une migration déjà mergée** (règle CLAUDE.md) → nouvelle migration uniquement.

## Spécification
- **`Settings.membershipPeriodDays Int @default(365)`** — durée de validité d'une cotisation en **jours** (entier, jamais de flottant). Défaut 365 (adhésion annuelle). Renseigné dans `SETTINGS_SEED` (`membershipPeriodDays: 365`) pour rester explicite.
- **`Member.lastContributionAt DateTime?`** — horodatage de la **dernière cotisation rapprochée** (posé par le rapprochement {{M6-08}} = `occurredAt` de la transaction `MEMBERSHIP`). `null` = aucune cotisation connue → membre `EN_RETARD`. Indexé si utile aux listes filtrées.
- **Statut stocké vs dérivé** : `Member.membership` (enum existant) reste en base comme **cache** (utile aux filtres/tri de liste), mis à jour au rapprochement ; la **source de vérité** est `deriveMembershipStatus(lastContributionAt, membershipPeriodDays, now)` (M6-02), recalculée à la lecture. Ce ticket n'implémente **aucune** dérivation — il pose seulement les colonnes.
- Migration générée par Prisma (`prisma migrate dev --name membership_period`), **additive** (colonnes nullable / avec défaut) → sans rupture des données existantes.

## Definition of Done
- [ ] `pnpm --filter @brasso/db exec prisma migrate dev` (ou `migrate deploy` en CI) applique la migration sans perte ; `prisma generate` régénère le client avec les 2 champs
- [ ] `SETTINGS_SEED` porte `membershipPeriodDays` ; le seed reste idempotent
- [ ] Lint + CI verte (build inclut `prisma generate`)
- [ ] Pas de régression : les tests API/core existants passent avec le client régénéré
- [ ] Critère fonctionnel observable : une base fraîchement migrée expose `Settings.membershipPeriodDays` (défaut 365) et `Member.lastContributionAt` (null par défaut)

## Dépendances
Bloqué par : {{M1-01}} — Bloque : {{M6-04}}, {{M6-08}}
