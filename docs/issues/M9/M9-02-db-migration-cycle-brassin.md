---
labels: db, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-02 — db : migration « cycle brassin » (DayPhase WHIRLPOOL, BatchMilestone, BatchPackaging, CatalogKind PRODUIT_FINI, durées par défaut)

## Contexte
M9 étend le cycle du brassin au-delà du Jour J. Ce ticket pose **l'ensemble des changements de schéma** du milestone en une seule migration cohérente, pour éviter une cascade de migrations partielles bloquant les tickets suivants. Décision structurante déjà arbitrée en SPEC-ORCHESTRATION §9.2 (Q10) : les produits finis sont un **`CatalogKind`**, pas un store dédié — parce que `SkuMapping.catalogItemId` et `DisplayScreenItem.catalogItemId` pointent déjà sur `CatalogItem`, et qu'un store séparé forcerait à dupliquer le décrément sur vente et la sélection d'écran livrés en M7.

**Règle absolue** (`CLAUDE.md`) : une migration déjà mergée n'est **jamais** modifiée — on en crée une nouvelle. SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A ; SPEC-ORCHESTRATION §3.2, §3.3, §9.2 (Q4, Q10), §9.4.

## Objectif
Le schéma Prisma porte les phases, jalons, conditionnements et produits finis nécessaires au cycle complet, avec les enums `core` miroités et une migration appliquée sans perte sur une base existante.

## Périmètre technique
- Fichiers concernés : `packages/db/prisma/schema.prisma` ; nouvelle migration sous `packages/db/prisma/migrations/` ; `packages/core/src/schemas/enums.ts` (miroir des enums) ; `packages/db/seed/` (contenances et articles produits finis de démonstration).
- Hors périmètre explicite : toute logique de calcul (M9-03 à M9-06), toute route API (M9-07 à M9-09), toute UI (M9-10 à M9-13).

## Spécification

**A. Extension `DayPhase` — `WHIRLPOOL`.**
Ajouter la valeur `WHIRLPOOL` à l'enum Prisma `DayPhase`, positionnée entre `EBULLITION` et `REFROIDISSEMENT`. Miroiter dans `packages/core/src/stateMachine/buildPlan.ts` (type `DayPhase`) et `packages/core/src/schemas/enums.ts` — **valeurs recopiées, jamais importées** (ADR-03/04).

> ⚠️ **L'assainissement du circuit de refroidissement n'est PAS une phase.** C'est une étape *dans* la phase `EBULLITION` (le moût bout et circule ~5 min avant le hors-flamme). Aucune valeur d'enum ne lui est ajoutée — cf. M9-03, qui la **dérive** du plan.

**B. Nouvelle table `BatchMilestone` — jalons datés du cycle.**
Un jalon = une phase post-ensemencement datée. Champs : `id`, `batchId` (FK `Batch`, `onDelete: Cascade`), `kind` (nouvel enum `BatchMilestoneKind { FERMENTATION, DRY_HOP, COLD_CRASH, GARDE }`), `plannedDurationDays Int`, `plannedStartAt DateTime`, `plannedEndAt DateTime`, `actualStartAt DateTime?`, `actualEndAt DateTime?`, `sortOrder Int`, `createdAt`, `updatedAt`. Contrainte `@@unique([batchId, kind])` (un jalon par type et par brassin) et `@@index([batchId])`, plus `@@index([plannedEndAt])` — cette dernière sert les échéances de la vue Brassins (M9-09) et la tuile du tableau de bord (M13).

**C. Nouvelle table `BatchPackaging` — conditionnement par contenant.**
Répond à la traçabilité « quel brassin est dans ces bouteilles ». Champs : `id`, `batchId` (FK `Batch`, `Cascade`), `catalogItemId` (FK `CatalogItem`, `Restrict` — l'article **produit fini** créé/incrémenté), `containerItemId String?` (FK `CatalogItem`, `SetNull` — l'article de **conditionnement** consommé : bouteille, fût, capsule), `containerVolumeL Float`, `quantity Int`, `packagedAt DateTime @default(now())`, `packagedById String?` (FK `User`, `SetNull`), `note String?`. Index `@@index([batchId])` et `@@index([catalogItemId])`.

**D. Extension `CatalogKind` — `PRODUIT_FINI`.**
Ajouter la valeur à l'enum Prisma et à son miroir `core`. Documenter en commentaire de schéma que cette famille est **alimentée par le conditionnement** (M9-08) et **décrémentée par les ventes** via le pipeline M7 existant, sans code nouveau. Ajouter sur `CatalogItem` un champ `sourceBatchId String?` (FK `Batch`, `SetNull`, index) : pour un produit fini, le brassin d'origine — nul pour les autres familles.

**E. Extension `Settings` — durées par défaut et paramètre d'assainissement.**
Conformément à ADR-01 (aucune constante métier hors de cette table) et à l'arbitrage §9.2 (Q4) : `defaultFermentationDays Int @default(14)`, `defaultDryHopDays Int @default(3)`, `defaultColdCrashDays Int @default(2)`, `defaultConditioningDays Int @default(21)`, `coolingCircuitSanitizeLeadMin Int @default(5)`. **Entiers** (jamais de flottant pour un paramètre métier), commentés avec leur unité.

**F. Extension `BatchMeasure`.** Aucune structure nouvelle : le type `VOLUME` existe déjà dans `MeasureType`, et `phase String?` permet de qualifier l'étape. Vérifier et **documenter** ce point dans le commentaire de schéma plutôt que d'ajouter une table — les prises de volume de M9-06 s'appuient sur l'existant.

**G. Seed.** Ajouter des contenances de référence en articles de catalogue (`CONDITIONNEMENT` : bouteille 33 cl, bouteille 75 cl, fût 20 L, fût 30 L, bouteille mécanique réutilisable) avec leur `containerVolumeL` en `attributes` JSONB. Le seed reste **idempotent**.

**H. Compatibilité.** La migration doit s'appliquer sur une base existante **sans perte** : tous les nouveaux champs sont nullables ou pourvus d'un défaut, aucune colonne n'est supprimée ni renommée. Vérifier explicitement que les batchs existants (sans jalon ni conditionnement) restent lisibles.

## Definition of Done
- [ ] Migration créée (jamais une migration existante modifiée) et appliquée avec succès sur une base **contenant déjà des données** (vérifier avec le seed de démo)
- [ ] Enums `core` miroités (`DayPhase`, `CatalogKind`, nouveau `BatchMilestoneKind`) — valeurs recopiées, aucun import DB ; schémas Zod correspondants dans `packages/core/src/schemas/enums.ts`
- [ ] Tests core sur les schémas Zod des nouveaux enums (couverture `core` maintenue à 100 %)
- [ ] `pnpm --filter @brasso/db db:migrate` puis `db:seed` verts depuis Windows (`DATABASE_URL` sur **port 5433**, `@postgres:` → `@localhost:`)
- [ ] Chaque table et champ ajouté porte un commentaire `///` expliquant son rôle et son unité
- [ ] Lint + typecheck + CI verts ; Prettier passé sur **tous** les fichiers touchés
- [ ] Critère observable : `npx prisma studio` montre les nouvelles tables, et un batch préexistant s'ouvre sans erreur

## Dépendances
Bloqué par : validation du go-live M8 — Bloque : {{M9-03}}, {{M9-05}}, {{M9-06}}, {{M9-07}}, {{M9-08}}, {{M9-09}}
