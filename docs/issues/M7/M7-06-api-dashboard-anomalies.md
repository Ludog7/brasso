---
labels: api, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-06 — api : dashboard des anomalies d'intégration (liste, résolution, échecs webhook)

## Contexte
Le mode dégradé ({{M7-05}}) et les échecs d'ingestion produisent des **anomalies** (`IntegrationAlert`) à traiter manuellement : « Vue de tableau de bord dédiée aux anomalies (traitement manuel des stocks, formation des bénévoles) » (§Mode dégradé). Deux types : `UNMAPPED_TRANSACTION` (vente non mappée, posée par {{M7-05}}) et `WEBHOOK_FAILURE` (webhook en échec — signature/normalisation/persistance). Ce ticket expose la **lecture** et la **résolution** de ces anomalies, avec ajustement de stock manuel optionnel. Le schéma `IntegrationAlert` est **déjà en base** ({{M1-01}}). SOURCE : `SPEC-ORCHESTRATION.md` §3.6 (`IntegrationAlert`, dashboard anomalies) ; `SPEC-FONCTIONNELLE.md` §Mode dégradé.

## Objectif
Un `caisse`/`admin` liste les anomalies ouvertes, comprend leur cause (transaction/provider liés), et les résout — en ajustant manuellement le stock si nécessaire — avec traçabilité.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/alerts/{routes,service,repository,schema}.ts` (nouveau module ; `schema` importe `IntegrationAlertSchema` de {{M7-01}}), **émission** d'une `IntegrationAlert` `WEBHOOK_FAILURE` depuis le pipeline webhook ({{M7-03}}) en cas d'échec d'ingestion, câblage `app.ts`, tests `apps/api/test/`.
- Hors périmètre explicite : création des `UNMAPPED_TRANSACTION` (déjà faite en {{M7-05}}) ; UI ({{M7-10}}). L'ajustement de stock manuel réutilise le registre M5 (pas de nouveau chemin d'écriture).

## Spécification
- **Lecture** (RBAC ressource `transactions`, `read` — même famille que les transactions ; `caisse`/`brasseur`/`admin` R) :
  - `GET /alerts` — liste paginée, filtres `status` (`OPEN`/`RESOLVED`), `type`, tri `createdAt` desc ; jointures légères sur `provider` (label) et `transaction` (montant, date, `externalProductId`).
  - `GET /alerts/:id` — détail avec le contexte de l'anomalie.
- **Résolution** (RBAC `transactions`… **écriture** : l'action « résoudre » n'est pas une modification de transaction mais un traitement d'anomalie — l'exposer sous une action autorisée à `caisse`/`admin`. Choix de cadrage : réutiliser la ressource `mapping` pour le côté « write » de la résolution, cohérent avec « ajustement de stock manuel requis » côté caisse) :
  - `POST /alerts/:id/resolve` — corps optionnel `{ stockAdjustment?: { catalogItemId, delta, note? } }`. Passe l'anomalie `RESOLVED` (`resolvedAt = now`). Si `stockAdjustment` fourni → crée **un** `StockMovement` `reason = ADJUSTMENT` (registre M5, `userId` = auteur, note) pour compenser la vente non mappée. 404 si anomalie absente ; no-op si déjà `RESOLVED`.
- **Émission `WEBHOOK_FAILURE`** : dans le pipeline {{M7-03}}, un échec **après** signature valide (normalisation impossible, erreur de persistance) crée une `IntegrationAlert` `WEBHOOK_FAILURE` (`message` technique non sensible, `providerId` renseigné) — sans divulguer de détail au provider (réponse générique). Un échec **de signature** ne crée **pas** d'anomalie (bruit/attaques) — il est seulement journalisé.
- **Traçabilité** : la résolution avec ajustement laisse un `StockMovement` daté et attribué ; pas de suppression d'anomalie (append-only de fait, on bascule le `status`).

## Definition of Done
- [ ] Tests d'intégration : liste/détail filtrés par `status`/`type` ; `resolve` sans ajustement → `RESOLVED` ; `resolve` avec `stockAdjustment` → `StockMovement` `ADJUSTMENT` créé + `RESOLVED` ; no-op si déjà résolue ; `WEBHOOK_FAILURE` émise sur échec post-signature (et **pas** sur signature invalide) ; RBAC (lecture `caisse`/`brasseur`/`admin` ; résolution refusée à `rgpd`)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : les ventes non mappées apparaissent dans le dashboard anomalies ; un bénévole les résout, avec ajustement de stock manuel si besoin

## Dépendances
Bloqué par : {{M7-01}}, {{M7-05}} — Bloque : {{M7-10}}
