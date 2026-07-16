---
labels: api, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-05 — api : rapprochement vente → stock + mode dégradé (cœur démo M7)

## Contexte
**Critère de démo M7** : « vente SumUp → stock décrémenté ; vente non mappée → alerte ». Une transaction `SALE` ingérée ({{M7-03}}) doit être **rapprochée d'un produit** via le mapping ({{M7-04}}) : si un `SkuMapping (providerId, externalProductId)` pointe vers un `catalogItem`, on **décrémente le stock** (mouvement `SALE`) et la transaction passe `MAPPED` ; sinon **mode dégradé** (ADR-09) — la transaction reste enregistrée pour le reporting, **aucune** déduction de stock, une **`IntegrationAlert` UNMAPPED_TRANSACTION** est créée. La **décision** est pure ({{M7-01}} `resolveSaleReconciliation`) ; l'écriture du mouvement réutilise le registre append-only de M5. SOURCE : `SPEC-ORCHESTRATION.md` §3.6 (pipeline ADR-09), §4 (démo) ; `SPEC-FONCTIONNELLE.md` §Mode dégradé.

## Objectif
Une vente entrante mappée décrémente automatiquement le stock du produit conditionné (mouvement tracé, lié à la transaction) ; une vente non mappée génère une anomalie sans toucher au stock — le tout idempotent et observable.

## Périmètre technique
- Fichiers/dossiers concernés : logique de rapprochement branchée sur l'ingestion webhook ({{M7-03}}) + endpoint de re-traitement manuel, `apps/api/src/modules/webhooks|mapping|stock` (selon découpage), tests `apps/api/test/`. Consomme `resolveSaleReconciliation` ({{M7-01}}), le registre `StockMovement` (M5) et `IntegrationAlert` (schéma {{M1-01}}).
- Hors périmètre explicite : dashboard/résolution des anomalies ({{M7-06}}) ; exports CSV ({{M7-07}}) ; UI ({{M7-09}}/{{M7-10}}). Ne modifie pas la transaction externe **au-delà** de son `status`/`memberId` (append-only ADR-09 : payload brut intact).

## Spécification
- **Rapprochement (à l'ingestion, post-traitement)** : après persistance d'une transaction `SALE`, chercher `SkuMapping` par `(providerId, externalProductId)`.
  - **Mappé** (`mapping.catalogItemId` non null) → `resolveSaleReconciliation` renvoie un mouvement : créer **un** `StockMovement` `reason = SALE`, `delta` **négatif** (unité de l'article ; quantité de la ligne si le payload l'expose, défaut 1), `externalTransactionId = transaction.id`, `userId = null` (origine système) ; passer `ExternalTransaction.status = MAPPED`. Transactionnel.
  - **Non mappé** (pas de mapping, ou `catalogItemId` null, ou `externalProductId` absent) → **mode dégradé** : créer une `IntegrationAlert` `type = UNMAPPED_TRANSACTION`, `status = OPEN`, `message` lisible (« 1 vente non identifiée sur {provider} le {date} — ajustement manuel du stock requis »), `providerId`/`transactionId` renseignés ; **aucun** mouvement de stock ; transaction reste `UNMAPPED`.
  - Le post-traitement ne doit **jamais** faire échouer l'ingestion webhook (une erreur de rapprochement → anomalie/log, pas un 500 au provider).
- **Idempotence** : une transaction donnée produit **au plus un** mouvement de stock (garde par `externalTransactionId` unique du mouvement de vente) et **au plus une** anomalie `UNMAPPED_TRANSACTION` ouverte. Rejeu → no-op.
- **Re-traitement manuel** `POST /transactions/:id/reprocess` (RBAC `mapping`, `update` — l'opération suppose un mapping créé entre-temps) : re-tente le rapprochement d'une transaction `UNMAPPED` ; si désormais mappée → mouvement + `MAPPED` + résolution de l'anomalie liée. 404 si transaction absente ; no-op si déjà `MAPPED`.
- **Non-régression stock** : le décrément passe par le **même** chemin d'écriture append-only que M5 (pas d'écriture directe hors registre) ; le niveau de stock se dérive des mouvements.

## Definition of Done
- [ ] Tests d'intégration : vente mappée → un `StockMovement` `SALE` (delta négatif, `externalTransactionId` lié) + transaction `MAPPED` ; vente non mappée → une `IntegrationAlert` `UNMAPPED_TRANSACTION`, **aucun** mouvement, transaction `UNMAPPED` ; **idempotence** (rejeu → pas de 2e mouvement/alerte) ; erreur de rapprochement ne casse pas l'ingestion ; `POST /reprocess` après création d'un mapping → mouvement + résolution
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants (M5 stock, M7-03 ingestion)
- [ ] **Critère de démo M7** observable : une vente SumUp mappée décrémente le stock du produit conditionné ; une vente non mappée apparaît en anomalie sans toucher au stock

## Dépendances
Bloqué par : {{M7-01}}, {{M7-03}}, {{M7-04}} — Bloque : {{M7-06}}, {{M7-10}}
