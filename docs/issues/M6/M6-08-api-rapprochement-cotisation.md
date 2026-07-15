---
labels: api, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-08 — api : rapprochement cotisation → membre (statut à jour) — cœur démo M6

## Contexte
**Critère de démo M6** : « cycle adhésion → cotisation HelloAsso → statut à jour ». Une transaction `MEMBERSHIP` ingérée ({{M6-07}}) doit être **rapprochée d'un membre**, ce qui pose sa date de dernière cotisation et le fait passer **`A_JOUR`**. Décision de cadrage M6-00 : rapprochement **automatique par email normalisé** avec **repli manuel** ; les cotisations non rapprochées restent « à rapprocher ». La dérivation de statut (`deriveMembershipStatus`) et la normalisation (`normalizeMatchKey`) sont pures ({{M6-02}}) ; la colonne `Member.lastContributionAt` vient de {{M6-01}}. SOURCE : `SPEC-ORCHESTRATION.md` §3.4/§3.6 ; `SPEC-FONCTIONNELLE.md` §Flux (association paiements↔membres).

## Objectif
Une cotisation entrante est rapprochée automatiquement du membre correspondant (ou assignée à la main), ce qui met à jour `lastContributionAt` et fait passer le membre à jour — le tout audité et observable.

## Périmètre technique
- Fichiers/dossiers concernés : logique de rapprochement branchée sur l'ingestion webhook ({{M6-07}}) + endpoints de gestion, `apps/api/src/modules/webhooks|members` (selon découpage), tests `apps/api/test/`. Consomme `normalizeMatchKey`/`deriveMembershipStatus` (core), `recordAudit` ({{M6-03}}).
- Hors périmètre explicite : `IntegrationAlert`/dashboard anomalies (M7) ; UI ({{M6-10}}). Ne modifie pas la transaction externe **au-delà** de son `status`/`memberId` (append-only ADR-09 : payload brut intact).

## Spécification
- **Auto-rapprochement (à l'ingestion)** : après persistance d'une transaction `MEMBERSHIP`, extraire l'email du payeur (payload brut), le passer à `normalizeMatchKey`, chercher un membre par email normalisé. **Match unique** → rapprocher (voir effet) et `status = MAPPED`. **Zéro ou plusieurs matchs** → laisser `status = UNMAPPED`, `memberId = null` (à traiter manuellement). Aucune exception ne doit faire échouer l'ingestion (le rapprochement est un post-traitement).
- **Rapprochement manuel** `POST /transactions/:id/reconcile` (RBAC `membres`, action `update` — l'opération modifie une donnée d'adhésion) — corps `{ memberId }`. Rapproche explicitement (repli quand l'auto échoue). 404 transaction/membre absents ; 409 si déjà rapprochée à un autre membre (ré-assignation = décision explicite, à cadrer : refus par défaut).
- **Effet du rapprochement** (transactionnel) : `ExternalTransaction.memberId = member.id`, `status = MAPPED` ; `Member.lastContributionAt = transaction.occurredAt` (si plus récente que l'existante) ; recalcul + persistance du cache `Member.membership = deriveMembershipStatus(lastContributionAt, settings.membershipPeriodDays, now)` → typiquement `A_JOUR`. Audite `CONTRIBUTION_RECONCILE` (`memberId`, montant/référence en `metadata`).
- **Liste « à rapprocher »** `GET /transactions?status=UNMAPPED&kind=MEMBERSHIP` (RBAC `transactions`, `read`) — cotisations en attente de rapprochement manuel, paginées, `occurredAt` desc.
- **Idempotence** : re-rapprocher la même transaction au même membre = no-op ; `lastContributionAt` ne régresse jamais (garde `max`).

## Definition of Done
- [ ] Tests d'intégration : auto-match par email normalisé (accents/casse) → `MAPPED` + `lastContributionAt` posé + `membership = A_JOUR` + audit `CONTRIBUTION_RECONCILE` ; email ambigu/inconnu → `UNMAPPED` (ingestion non cassée) ; `POST /reconcile` manuel (repli) ; 404/409 ; `GET /transactions?status=UNMAPPED` liste les cotisations en attente ; `lastContributionAt` ne régresse pas ; RBAC
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] **Critère de démo M6** observable : une cotisation HelloAsso dont l'email correspond à un membre le fait passer `A_JOUR` automatiquement ; une cotisation sans correspondance apparaît « à rapprocher » et peut être assignée à la main → membre `A_JOUR`

## Dépendances
Bloqué par : {{M6-01}}, {{M6-02}}, {{M6-03}}, {{M6-04}}, {{M6-07}} — Bloque : {{M6-10}}
