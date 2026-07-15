---
labels: api, feature, P0
milestone: M5 — Stocks complets
---
# M5-04 — api : mouvements manuels + inventaire périodique

## Contexte
La logique **BULK** est explicitement manuelle (§Stock) : « Pas de déduction automatisée par batch. Déduction forfaitaire ou manuelle (ex : consommation de CO₂ par purges + carbonatation de X fûts). Inventaire périodique saisi par les brasseurs (mensuel/trimestriel). » Le registre `StockMovement` est **append-only** (trigger en base depuis M1) : on n'édite jamais un mouvement, on en ajoute. L'inventaire ne stocke pas un état : il **génère un mouvement d'ajustement** (`delta = compté − niveau courant`, reason `INVENTORY`). SOURCE MÉTIER : `SPEC-FONCTIONNELLE.md` §Stock (Articles Bulk, Alertes et coût de revient).

## Objectif
Enregistrer des mouvements de stock manuels (achat, ajustement, forfait BULK, perte…) et saisir un inventaire périodique qui recale le niveau — le tout append-only et tracé (`userId`).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/stock/{routes,service,repository}.ts` (extension), `apps/api/tests/`.
- Réutilise `stockMovementInputSchema`/`inventoryCountSchema` + `deriveStockLevel` ({{M5-01}}).
- Hors périmètre explicite : déduction batch automatique ({{M5-05}}), agrégation alertes/coût ({{M5-06}}), UI ({{M5-07}}). `PRODUCTION`/`SALE` **interdits** en saisie manuelle (réservés batch / hub caisse).

## Spécification
- **RBAC** : `stocks:update` (admin/brasseur ; caisse **403**). Lectures `stocks:read`.
- Routes :
  - `POST /stock/movements` — insère un `StockMovement` `{ catalogItemId, delta, reason, stockLotId?, note? }` (validé `stockMovementInputSchema` : reason ∈ manuel, `delta ≠ 0`). Pose `userId` = utilisateur courant. 201 avec le mouvement + le **nouveau niveau** dérivé. Un forfait BULK (ex. purge CO₂) = un mouvement `delta < 0` reason `ADJUSTMENT`/`OTHER`.
  - `GET /stock/items/:id/movements` — registre paginé (ordre `createdAt` desc), pour la traçabilité et l'UI. 404 si article absent.
  - `POST /stock/inventory` — corps `{ counts: [{ catalogItemId, countedQuantity, note? }] }`. Pour chaque ligne : lit le niveau courant (`deriveStockLevel`), calcule `delta = countedQuantity − niveau`, et **si `delta ≠ 0`** insère un `StockMovement` reason `INVENTORY` (sinon ligne no-op, remontée `unchanged`). Transactionnel (toutes les lignes ou aucune). Réponse : par ligne, `{ catalogItemId, previousLevel, countedQuantity, delta, movementId? }`.
- Append-only : jamais d'`UPDATE`/`DELETE` de mouvement (garanti par le trigger ; le service n'émet que des `INSERT`).

## Definition of Done
- [ ] Tests d'intégration : mouvement manuel met à jour le niveau dérivé ; `PRODUCTION`/`SALE`/`delta=0` rejetés (400) ; inventaire génère un mouvement d'ajustement au bon `delta`, ligne sans écart = `unchanged` ; transaction atomique multi-lignes ; RBAC (brasseur OK, caisse 403, anon 401) ; 404 article inexistant
- [ ] Lint + CI verte ; pas de régression
- [ ] Critère fonctionnel observable : saisir un achat BULK puis un inventaire qui recale le niveau, et retrouver les deux dans le registre `GET /stock/items/:id/movements`

## Dépendances
Bloqué par : {{M5-03}} — Bloque : {{M5-07}}
