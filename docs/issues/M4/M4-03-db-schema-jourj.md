---
labels: db, feature, P0
milestone: M4 — Jour J
---
# M4-03 — db : schéma Jour J (DayPhase, DeviationLog enrichi, journal de corrections, idempotence offline)

## Contexte
Les modèles `BatchDayState` et `DeviationLog` existent depuis {{M1-01}}, mais incomplets pour piloter le Jour J : `DeviationLog` ne porte ni la **phase** ni le **statut forcé** (l'intention `DeviationLog` de {{M1-13}} les fournit) ; il manque un **journal des décisions de correction** (« Journalisation des décisions », `SPEC-FONCTIONNELLE.md`) et une **table d'idempotence** pour rejouer la file offline (ADR-08). CLAUDE.md : **jamais modifier une migration mergée** → nouvelle migration.

## Objectif
Une nouvelle migration Prisma aligne le schéma Jour J sur les besoins M4, sans casser l'existant ni renommer l'enum `DayPhase` (déjà en base).

## Périmètre technique
- Fichiers/dossiers concernés : `packages/db/prisma/schema.prisma`, **nouvelle** migration `packages/db/prisma/migrations/`, seed si nécessaire.
- Hors périmètre explicite : logique applicative (M4-04+), pas de renommage d'enum ni de modification d'une migration existante.

## Spécification
- `DeviationLog` : ajouter `phase DayPhase`, `forcedFromStatus String` (StepStatus au moment du forçage), `occurredAt DateTime` (horodatage **métier**, distinct de `createdAt`). Rétrocompat : colonnes nullables ou avec défaut.
- `BatchDayState` : `state Json?` conserve l'instantané core (`dayStateSchema`, M4-01) ; ajouter `revision Int @default(0)` — compteur **monotone** incrémenté à chaque transition (détection de rejeu périmé côté sync, M4-06).
- Nouveau `BatchCorrectionLog` (append-only) : `id`, `batchId` (FK → Batch, cascade), `stepId String`, `type` (`EXTEND_BOIL` | `ADD_SUGAR` | `DILUTE` | `OTHER`), `payload Json` (proposition retenue + valeurs projetées), `authorId String?` (FK → User, SetNull), `createdAt`.
- Nouveau `DayEventLog` (idempotence du rejeu, M4-06) : `id String @id` = `clientEventId`, `batchId`, `type String`, `appliedAt DateTime`, `resultRevision Int`, `rejected Boolean @default(false)`, `rejection String?`. Index `@@index([batchId])`.
- Documenter (commentaire schéma) la correspondance `DayPhase` ↔ `Phase` core (M4-01 `phaseToDayPhase`) : `INITIALISATION/EMPATAGE/FILTRATION/EBULLITION/REFROIDISSEMENT/ENSEMENCEMENT/TERMINE`.

## Definition of Done
- [ ] `prisma migrate dev` génère une **nouvelle** migration ; `prisma validate` OK ; `prisma generate` à jour
- [ ] Seed inchangé (ou adapté) et vert
- [ ] Aucune migration existante modifiée
- [ ] Lint + CI verte ; build `packages/db` vert
- [ ] Critère fonctionnel observable : `BatchDayState.revision`, `DeviationLog.phase/forcedFromStatus/occurredAt`, `BatchCorrectionLog`, `DayEventLog` présents en base

## Dépendances
Bloqué par : {{M1-01}} — Bloque : {{M4-05}}, {{M4-06}}, {{M4-07}}
