---
labels: api, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-04 — api : CRUD mapping SKU + lecture des transactions externes

## Contexte
Chaque produit vendable possède un **SKU interne** et un **mapping explicite** vers un article/catégorie externe (§Mapping produit). Ce mapping est la clé du rapprochement vente→stock ({{M7-05}}) : `SkuMapping (providerId, externalProductId) → catalogItemId`. La matrice §3.5 donne des droits **asymétriques** : `caisse` a **CRUD sur `mapping`** mais **R seulement sur `transactions`** ; `admin` CRUD partout ; `brasseur` R. Le schéma (`SkuMapping`, `ExternalTransaction`) est **déjà en base** ({{M1-01}}). SOURCE : `SPEC-ORCHESTRATION.md` §3.6 (`SkuMapping`), §3.5 (RBAC `mapping`/`transactions`) ; `SPEC-FONCTIONNELLE.md` §Mapping produit.

## Objectif
Un `caisse`/`admin` peut créer/éditer/supprimer les mappings SKU↔produit externe et lister les transactions externes (read-only), avec RBAC deny-by-default appliqué.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/mapping/{routes,service,repository,schema}.ts` (nouveau module ; `schema` importe `SkuMappingInputSchema` de {{M7-01}}), lecture des transactions dans ce module ou un module `transactions` léger, câblage `app.ts`, tests `apps/api/test/`.
- Hors périmètre explicite : ingestion webhook ({{M7-03}}) ; rapprochement→stock et anomalies ({{M7-05}}/{{M7-06}}) ; UI ({{M7-09}}).

## Spécification
- **CRUD mapping** (RBAC ressource `mapping`) :
  - `GET /mappings` (`read`) — liste paginée, filtrable par `providerId`, jointure sur `catalogItem` (nom/kind).
  - `POST /mappings` (`create`) — `{ internalSku, catalogItemId?, providerId, externalProductId, externalCategory? }` validé par `SkuMappingInputSchema`. Unicité `(providerId, externalProductId)` et `internalSku` (déjà en schéma) → `409 MAPPING_CONFLICT` en cas de doublon. `catalogItemId` optionnel mais **doit référencer un `CatalogItem` existant** s'il est fourni (sinon 400/404).
  - `PATCH /mappings/:id` (`update`), `DELETE /mappings/:id` (`delete`) — 404 si absent.
- **Lecture transactions** (RBAC ressource `transactions`, **`read` uniquement** — jamais de write, ADR-09) :
  - `GET /transactions` — liste paginée des `ExternalTransaction`, filtres `status` (`MAPPED`/`UNMAPPED`/`IGNORED`), `kind` (`SALE`/`MEMBERSHIP`/…), `providerId`, tri `occurredAt` desc. Ne renvoie **jamais** `rawPayload` brut intégral (champ volumineux/sensible) — seulement les champs normalisés + un indicateur de présence de payload.
  - `GET /transactions/:id` — détail normalisé (sans payload brut).
- **RBAC** : `caisse` = CRUD `mapping` + R `transactions` ; `brasseur` = R sur les deux ; `admin` = CRUD `mapping` + R `transactions` (les transactions restent read-only pour tous, ADR-09) ; `rgpd` = aucun. Deny-by-default vérifié par test.

## Definition of Done
- [ ] Tests d'intégration : CRUD mapping (création, unicité→409, `catalogItemId` inexistant→erreur maîtrisée, patch, delete→404) ; liste transactions filtrée par `status`/`kind` sans exposer `rawPayload` ; RBAC (`caisse` CRUD mapping / R transactions ; `rgpd` refusé ; write transaction impossible pour tous)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : un utilisateur `caisse` crée un mapping `externalProductId → catalogItem` et consulte la liste des ventes ingérées, sans pouvoir modifier une transaction

## Dépendances
Bloqué par : {{M1-01}}, {{M7-01}} — Bloque : {{M7-05}}, {{M7-09}}
