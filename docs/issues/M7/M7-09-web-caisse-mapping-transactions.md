---
labels: web, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-09 — web : caisse — mapping SKU & transactions externes

## Contexte
Premier écran front M7 : l'espace **caisse** (§Mapping produit). Il consomme le CRUD mapping et la lecture des transactions ({{M7-04}}). Matrice §3.5 : `caisse` = CRUD mapping + R transactions ; `admin` idem ; `brasseur` = R ; `rgpd` = aucun → l'entrée et les actions d'écriture sont **masquées** selon le rôle (l'API reste l'autorité). **Réutiliser les patterns d'un feature web existant** (ex. `features/members` M6-09, `features/stock` M5-07) pour TanStack Query / RBAC UI / shadcn / tests. SOURCE : `SPEC-FONCTIONNELLE.md` §Mapping produit ; `SPEC-ORCHESTRATION.md` §3.5 ; UI atelier §6 (≥ 48 px, mode sombre, AA).

## Objectif
Un `caisse`/`admin` gère les mappings SKU↔produit externe et consulte la liste des transactions externes (ventes/cotisations) avec leur statut de rapprochement.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/cash/` (`hooks.ts` TanStack Query + `mappingKeys`/`transactionKeys`, `labels.ts`, `MappingList.tsx`, `MappingFormDialog.tsx`, `TransactionList.tsx`, `TransactionStatusBadge.tsx`), route(s) `apps/web/src/routes/cash/…`, entrée de navigation (masquée hors rôle), `apps/web/src/lib/api.ts` (`mappingApi`/`transactionsApi` + types), tests `apps/web/src/test/cash.test.tsx`.
- Hors périmètre explicite : dashboard anomalies ({{M7-10}}) ; exports CSV ({{M7-11}}) ; affichage ({{M7-12}}/{{M7-13}}).

## Spécification
- **`mappingApi`** : `list({providerId?})`, `create(input)`, `update(id, input)`, `remove(id)`. **`transactionsApi`** : `list({status?, kind?, providerId?})`, `get(id)`. Types miroir des vues API (dates ISO, jamais de payload brut).
- **`MappingList` + `MappingFormDialog`** : tableau des mappings (SKU interne, produit externe, catégorie, article catalogue lié) ; création/édition (sélection du `catalogItem`, `providerId`, `externalProductId`) ; gestion du conflit `409` (message clair « mapping déjà défini pour ce produit externe »).
- **`TransactionList`** : tableau paginé filtrable par `status`/`kind`, `TransactionStatusBadge` (`MAPPED` = vert / `UNMAPPED` = ambre / `IGNORED` = gris) ; lecture seule (aucune action d'écriture sur une transaction, ADR-09).
- **RBAC UI** : `canManageMapping(roles) = admin || caisse` masque les actions d'écriture du mapping ; `brasseur` voit en lecture ; entrée de nav masquée pour `rgpd`.
- **A11y/atelier** : cibles ≥ 48 px, contraste AA, mode sombre, pas de drag-and-drop.

## Definition of Done
- [ ] Tests web (Vitest/RTL, faux `fetch`) : liste mappings + création (POST) puis édition (PATCH) + conflit 409 géré ; suppression ; liste transactions filtrée par `status`/`kind` ; `TransactionStatusBadge` selon statut ; RBAC UI (écriture mapping masquée hors `admin`/`caisse` ; écran masqué pour `rgpd`)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés (piège CRLF connu)
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : un `caisse` crée un mapping et voit les ventes ingérées passer `MAPPED`, sans pouvoir éditer une transaction

## Dépendances
Bloqué par : {{M7-04}} — Bloque : —
