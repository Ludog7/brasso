---
labels: api, feature, P1
milestone: M5 — Stocks complets
---
# M5-06 — api : alertes de seuil + coût de revient par batch

## Contexte
Deux restitutions du milestone : les **alertes de seuil** différenciées par `kind` (§3.3 « Alertes de seuil différenciées par kind » ; §Stock « Alertes de seuil sur Recette et Bulk, comportements différenciés ») et le **coût de revient par batch** (§Stock « Basé sur ingrédients Recette + conditionnement. Bulk imputé forfaitairement si nécessaire. »), deuxième moitié du critère de démo M5. Les calculs purs existent ({{M5-01}} `evaluateReorder`, {{M5-02}} `computeBatchCost`) ; ce ticket les branche sur la base et les expose.

## Objectif
Exposer `GET /stock/alerts` (articles sous seuil, comportement différencié) et `GET /batches/:id/cost` (coût de revient chiffré depuis les coûts de référence catalogue).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/stock/{routes,service,repository}.ts` (alertes) ; endpoint coût dans `apps/api/src/modules/batches/{routes,service,repository}.ts` (ressource `recettes`, cohérent avec la fiche batch M3/M4) ; `apps/api/tests/`.
- Réutilise `evaluateReorder` ({{M5-01}}), `computeBatchCost` ({{M5-02}}), `deriveStockLevel`, les réservations/mouvements du batch.
- Hors périmètre explicite : UI ({{M5-07}} alertes, {{M5-08}} coût), coût lot pondéré (V2).

## Spécification
- **`GET /stock/alerts`** (RBAC `stocks:read`) — parcourt les `CatalogItem` actifs, calcule `level`/`reservedOutstanding`, applique `evaluateReorder` (RECETTE tient compte des réservations, BULK/CONDITIONNEMENT non). Renvoie **uniquement** les articles `below = true` : `{ items: [{ id, name, kind, level, available, reorderThreshold }] }`, triés par criticité (`available − threshold` croissant). Articles sans `reorderThreshold` → jamais alertés.
- **`GET /batches/:id/cost`** (RBAC `recettes:read`) — coût de revient via `computeBatchCost` ({{M5-02}}) :
  - **Ingrédients RECETTE** : si le batch est ensemencé, valorise les mouvements `PRODUCTION` du batch ({{M5-05}}) — quantités **réellement consommées** ; sinon, valorise les réservations `RESERVED` (estimation planifiée). Chaque quantité × `CatalogItem.defaultUnitCostCents`. `basis: "consumed" | "planned"` dans la réponse.
  - **Conditionnement** : mouvements liés au batch (`batchId`) sur des articles `CONDITIONNEMENT`, s'il y en a (sinon 0).
  - **Bulk** : `bulkForfaitCents` optionnel (query `?bulkForfaitCents=`) → imputation forfaitaire.
  - `batchVolumeL` = volume réel (mesure `VOLUME`) sinon planifié ; `packagedUnits` = optionnel (query) pour le coût à l'unité.
  - Réponse : sortie `computeBatchCost` (`totalCents`, `costPerLiterCents`, breakdown, `missingCostLines`) + `basis`. 404 batch absent.
- **Wording** : le coût est une **estimation** (coûts de référence catalogue, hors coût lot réel) — le libellé et la doc de la route le disent explicitement ; pas de « coût exact/garanti ».

## Definition of Done
- [ ] Tests d'intégration : `GET /stock/alerts` ne remonte que les articles sous seuil, RECETTE net des réservations vs BULK brut, sans-seuil jamais alerté, tri par criticité ; `GET /batches/:id/cost` valorise les mouvements consommés (`basis:"consumed"`) après ensemencement et les réservations avant (`basis:"planned"`), `missingCostLines` sur article sans `defaultUnitCostCents`, `costPerLiterCents` sur volume réel, 404 batch absent ; RBAC (caisse lit, anon 401)
- [ ] Lint + CI verte ; pas de régression
- [ ] Critère fonctionnel observable : un batch ensemencé (M5-05) expose un coût de revient chiffré ; un article sous son seuil apparaît dans les alertes

## Dépendances
Bloqué par : {{M5-02}}, {{M5-03}} — Bloque : {{M5-07}}, {{M5-08}}
