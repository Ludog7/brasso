---
labels: db, feature, P0
milestone: M1 — Modèle & core
---
# M1-01 — Schéma Prisma complet (recettes polymorphes, batch, stock, membres, hub)

## Contexte
Cœur du modèle de données, structuré par SPEC-ORCHESTRATION §3 et ADR-06/07/09. Étend le schéma initial (M0-04) avec l'ensemble des entités métier. C'est la fondation de tous les modules applicatifs.

## Objectif
Un `prisma migrate dev` applique le schéma complet ; toutes les entités de §3 existent avec leurs relations, contraintes et enums.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/db/prisma/schema.prisma`, nouvelle(s) migration(s), types réexportés.
- Hors périmètre explicite : seed (M1-02), logique métier (API/core), UI.

## Spécification (détail §3)
- **Recettes polymorphes (ADR-06, §3.1)** : `Recipe` (id, name, engine `BEER|ALT_FERMENTED|SOFT_DRINK`, status `DRAFT|PUBLISHED|ARCHIVED`, version, familyId) + `RecipeBeerDetails` / `RecipeAltDetails` / `RecipeSoftDetails` (1-1). Unicité `(familyId, version)`. `RecipeIngredient` polymorphe par catégorie, `RecipeProcessStep` ordonné (type + params JSONB).
  - Contrainte : `RecipeAltDetails.stabilizationMethod` non-null (validée aussi côté core — M1-12).
- **Batch (ADR-07, §3.2)** : `Batch` (batchNumber séquence lisible, recipeId + recipeVersion, `recipeSnapshot` JSONB, equipmentProfileId, status `PLANIFIE|EN_BRASSAGE|EN_FERMENTATION|EN_CONDITIONNEMENT|TERMINE|ANNULE`, dates), `BatchMeasure`, `DeviationLog`, `BatchDayState`, table de liaison brasseurs.
- **Équipement** : `EquipmentProfile` (volume nominal, deadspace, pertes, évaporation L/h, profil calorique, profils d'eau JSONB).
- **Stock (§3.3)** : `CatalogItem` (kind `RECETTE|BULK|CONDITIONNEMENT`), `StockLot` (quantité, DLU, coût en centimes), `StockMovement` append-only, `StockReservation`.
- **Membres/RGPD (§3.4)** : `Member`, `MemberConsent` (historisé), `User` (lié ou non à Member), `Role`/`UserRole`, `AuditLog` append-only. Séparation stricte : données techniques → `User.id` uniquement.
- **Hub caisse (§3.6)** : `ExternalProvider`, `ExternalTransaction` append-only (payload brut JSONB + champs normalisés), `SkuMapping`, `IntegrationAlert`.
- IDs `cuid`, montants en **centimes**, timestamps `createdAt/updatedAt`. Index sur les FK et les champs de recherche.

## Definition of Done
- [ ] `prisma migrate dev` OK, `prisma validate` vert
- [ ] Toutes les entités §3 présentes avec relations et enums corrects
- [ ] Append-only respecté au niveau modèle (pas d'update prévu sur movements/transactions/audit)
- [ ] Pas de constante métier hardcodée (ADR-01)
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : schéma migrable from scratch, prêt pour le seed

## Dépendances
Bloqué par : {{M0-04}} — Bloque : {{M1-02}}
