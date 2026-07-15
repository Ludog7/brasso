---
labels: api, feature, P0
milestone: M5 — Stocks complets
---
# M5-03 — api : module `stock` (catalogue CRUD + lots + niveaux dérivés)

## Contexte
Les stocks n'ont aujourd'hui qu'une **lecture picker** (`GET /catalog-items`, module `referentials` M2-04) pour l'éditeur de recettes. M5 ouvre la **gestion** du stock : créer/éditer des articles de catalogue (RECETTE/BULK/CONDITIONNEMENT), tenir des lots, et surtout **exposer le niveau courant dérivé du registre** append-only `StockMovement` (le schéma M1 précise : « la quantité courante se dérive des mouvements »). Fondations du milestone : les mouvements/inventaire ({{M5-04}}), la déduction batch ({{M5-05}}) et les alertes/coût ({{M5-06}}) s'y adossent. SOURCE MÉTIER : `SPEC-FONCTIONNELLE.md` §Stock ; `SPEC-ORCHESTRATION.md` §3.3 ; RBAC ressource `stocks` §3.5 (déjà déclarée dans `rbac/matrix.ts`).

## Objectif
Un nouveau module `apps/api/src/modules/stock/` expose le CRUD catalogue, la création de lots, et la liste des articles **avec niveau de stock dérivé** — le tout deny-by-default sur la ressource `stocks`.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/stock/{routes,service,repository,schema}.ts` (nouveaux), câblage dans `app.ts` (option `stockRepository` injectable comme les autres modules), `apps/api/tests/`.
- Réutilise `@brasso/core` : `catalogItemCreateSchema`/`catalogItemUpdateSchema` + `deriveStockLevel`/`evaluateReorder` ({{M5-01}}).
- Hors périmètre explicite : mouvements manuels/inventaire ({{M5-04}}), déduction à l'ensemencement ({{M5-05}}), alertes agrégées & coût ({{M5-06}}), UI ({{M5-07}}). Le picker `referentials` **reste inchangé** (lecture seule éditeur) ; le module `stock` porte la gestion — ne pas dupliquer, documenter la frontière.

## Spécification
- **RBAC** (matrice §3.5) : lectures `stocks:read` (admin/brasseur/caisse), écritures `stocks:create`/`stocks:update` (admin/brasseur ; caisse **403**).
- Routes (préfixe `/stock`) :
  - `GET /stock/items` — liste paginée (filtres `kind`/`category`/`search`, `limit`≤100/`offset` comme M2-04). Chaque item porte : champs catalogue + `level` (`deriveStockLevel` sur ses mouvements) + `reservedOutstanding` (somme des réservations `RESERVED`) + `available`/`below` (`evaluateReorder`). Requêtes agrégées (pas de N+1 : `groupBy` sur `StockMovement.delta` et `StockReservation.quantity`).
  - `GET /stock/items/:id` — détail : catalogue + `level` + lots (`StockLot`) + N derniers mouvements. 404 si absent.
  - `POST /stock/items` — crée un `CatalogItem` (`catalogItemCreateSchema`). 201.
  - `PATCH /stock/items/:id` — met à jour (`catalogItemUpdateSchema` : `name`, `defaultUnitCostCents`, `reorderThreshold`, `isActive`, `attributes`…). `kind` **non modifiable** après création (intégrité de la logique de stock). 404 si absent.
  - `POST /stock/items/:id/lots` — crée un `StockLot` `{ lotCode?, quantity, bestBeforeAt?, unitCostCents? }`. Le lot est une aide d'inventaire ; il **ne** crée **pas** implicitement de mouvement (l'entrée en stock d'un achat passe par {{M5-04}}). 404 si article absent.
- Erreurs : classe avec `readonly statusCode`/`readonly code` (pattern `plugins/errorHandler.ts`) — ex. `CatalogItemNotFoundError` (404 `CATALOG_ITEM_NOT_FOUND`).
- Repository : interface injectable + `PrismaStockRepository` (tests en mémoire, comme les autres modules).

## Definition of Done
- [ ] Tests d'intégration : création/édition d'article (RBAC brasseur OK, caisse 403, anon 401) ; `kind` immuable au PATCH ; `GET /stock/items` renvoie `level`/`reservedOutstanding`/`below` cohérents avec des mouvements & réservations seedés ; création de lot ; 404 article inexistant
- [ ] Lint + CI verte ; pas de régression (referentials picker intact)
- [ ] Critère fonctionnel observable : créer un article, y poser des mouvements/réservations et voir le **niveau dérivé** + l'indicateur de seuil via `GET /stock/items`

## Dépendances
Bloqué par : {{M5-01}} — Bloque : {{M5-04}}, {{M5-05}}, {{M5-06}}, {{M5-07}}
