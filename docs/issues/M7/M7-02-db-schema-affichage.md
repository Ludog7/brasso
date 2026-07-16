---
labels: db, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-02 — db : schéma du module d'affichage (surfaces, écrans, produits affichés)

## Contexte
Le hub caisse (`ExternalProvider`/`ExternalTransaction`/`SkuMapping`/`IntegrationAlert`) est **déjà en base** depuis {{M1-01}} : M7 n'ajoute **aucun** schéma côté caisse. En revanche le **module d'affichage en brasserie** (§Module d'affichage) n'a **pas** de modèle : il faut le poser. On définit des **surfaces** (Bar, Salle, Événement — libellés **libres**, pas d'enum : ADR-01, aucune constante métier hardcodée), des **écrans** (template + mentions légales) et la **sélection de produits** affichés avec leurs indicateurs. C'est le **seul** changement de schéma de M7. SOURCE : `SPEC-ORCHESTRATION.md` §3.5 (ressource `affichage`), ADR-01 ; `SPEC-FONCTIONNELLE.md` §Module d'affichage (surfaces, templates, sélection, sync, mentions légales).

## Objectif
Le schéma expose des surfaces d'affichage, des écrans (template + mentions) et les produits sélectionnés par écran (avec flags), permettant à l'API ({{M7-08}}) de servir un rendu d'écran synchronisé au stock.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/db/prisma/schema.prisma` (nouveaux modèles + 1 enum), **nouvelle** migration `packages/db/prisma/migrations/<timestamp>_display_screens/migration.sql`, seed optionnel d'une surface/écran de démo dans `packages/db/seed/`, régénération du client Prisma.
- Hors périmètre explicite : logique de rendu/sélection (pure → {{M7-01}}) ; endpoints ({{M7-08}}) ; UI ({{M7-12}}/{{M7-13}}). **Ne jamais modifier une migration déjà mergée** (CLAUDE.md) → nouvelle migration.

## Spécification
- **`enum DisplayTemplate { LIST TABLE CARDS }`** — mode de rendu d'un écran (§Templates : liste, tableau, cartes). Enum figé (choix UI, pas une constante métier).
- **`model DisplaySurface`** : `id` (cuid), `name` (String, **libre** — ex. « Bar », « Salle », « Événement »), `description?`, `isActive` (défaut true), timestamps. `@@unique([name])`.
- **`model DisplayScreen`** : `id`, `surfaceId` (relation → `DisplaySurface`, `onDelete: Cascade`), `name`, `template` (`DisplayTemplate`, défaut `CARDS`), `legalMentions` (String? — mentions alcool/allergènes, **texte libre** porté par l'écran), `isActive` (défaut true), timestamps. Index sur `surfaceId`.
- **`model DisplayScreenItem`** : `id`, `screenId` (→ `DisplayScreen`, `onDelete: Cascade`), `catalogItemId` (→ `CatalogItem`, `onDelete: Cascade` — un produit vendable/conditionné), `isNew` / `isFavorite` / `isSpecial` (Boolean, défaut false — indicateurs « nouveau »/« coup de cœur »/« brassin spécial »), `priceCents` (Int?, prix affiché optionnel en centimes), `sortOrder` (Int, défaut 0), timestamps. `@@unique([screenId, catalogItemId])`, index sur `screenId`.
- Ajouter les **relations inverses** nécessaires (`CatalogItem.displayItems DisplayScreenItem[]`).
- Migration **additive** (nouvelles tables/enum uniquement) → sans rupture des données existantes.
- **Seed** (idempotent, optionnel mais recommandé pour la démo {{M7-13}}) : une surface « Bar » + un écran `CARDS` avec 2-3 produits conditionnés issus du seed existant.

## Definition of Done
- [ ] `prisma migrate dev --name display_screens` applique la migration sans perte ; `prisma generate` régénère le client avec `DisplaySurface`/`DisplayScreen`/`DisplayScreenItem`/`DisplayTemplate`
- [ ] Le seed reste **idempotent** (relance sans doublon) si une surface/écran de démo est ajoutée
- [ ] Lint + CI verte (build inclut `prisma generate`)
- [ ] Pas de régression : les tests API/core existants passent avec le client régénéré
- [ ] Critère fonctionnel observable : une base fraîchement migrée expose les 3 modèles d'affichage et permet de rattacher des produits à un écran d'une surface

## Dépendances
Bloqué par : {{M1-01}} — Bloque : {{M7-08}}
