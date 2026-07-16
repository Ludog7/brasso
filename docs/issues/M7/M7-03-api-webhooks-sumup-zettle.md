---
labels: api, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-03 — api : webhooks SumUp & Zettle (ingestion signée, idempotente, normalisation SALE)

## Contexte
Les ventes des terminaux physiques arrivent par **webhook SumUp/Zettle** (§Intégrations). ADR-09 : transactions externes **read-only**, ingérées et **jamais modifiées** (`ExternalTransaction` append-only, verrouillée par trigger, payload brut conservé). Ce ticket **réutilise la fondation générique posée en {{M6-07}}** : `verifyWebhookSignature(kind, …)` (les stratégies `SUMUP`/`ZETTLE` sont **déjà enregistrées**, défaut HMAC-SHA256), l'accès au **corps brut** de la route webhook, le rate-limit, le secret **en variable d'environnement** (`provider.webhookSecretRef`), l'idempotence `(providerId, externalId)`. On ajoute les **deux nouvelles routes** et la **normalisation SALE** propre à chaque provider (comme la normalisation HelloAsso vit dans le module webhooks). SOURCE : `SPEC-ORCHESTRATION.md` §3.6 (ADR-09), §6 (rate-limit, secrets env, signature) ; `SPEC-FONCTIONNELLE.md` §Intégrations.

## Objectif
`POST /webhooks/sumup` et `POST /webhooks/zettle` acceptent un événement de vente signé, le persistent une seule fois (idempotent) en `ExternalTransaction` normalisée (`kind = SALE`, `status = UNMAPPED`, `externalProductId` extrait), et rejettent toute requête non signée/rejouée.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/webhooks/` (étendre le module M6-07 : `routes.ts` +2 routes, `service.ts` +méthodes `ingestSumUp`/`ingestZettle`, `schema.ts` +normaliseurs `normalizeSumUpSale`/`normalizeZettleSale` produisant `ExternalSaleSchema` de {{M7-01}}), câblage `app.ts` (routes publiques + rate-limit + raw body, réutiliser le hook M6-07), amorçage des `ExternalProvider` `SUMUP`/`ZETTLE` (seed idempotent), tests `apps/api/test/`.
- Hors périmètre explicite : **rapprochement vente→stock** ({{M7-05}} branche sa logique sur l'ingestion) ; **mode dégradé / `IntegrationAlert`** ({{M7-05}}/{{M7-06}}) ; CRUD mapping ({{M7-04}}). Ne créer **aucun** mouvement de stock ici.

## Spécification
- **Routes publiques** `POST /webhooks/sumup` et `POST /webhooks/zettle` — **non authentifiées** (pas de session) mais **vérifiées par signature** (`verifyWebhookSignature(provider.kind, …)`) et **rate-limitées**. Accès au **corps brut** requis (la signature porte sur les octets exacts) : réutiliser le hook/parser dédié introduit en {{M6-07}}, sans casser le parsing JSON global.
- **Vérification de signature** : identique à M6-07 (secret résolu depuis la variable d'environnement `provider.webhookSecretRef`, comparaison à temps constant). Échec → `401 WEBHOOK_SIGNATURE_INVALID`, **aucune écriture**.
- **Normalisation SALE** (par provider, défensive) → `ExternalSaleSchema` ({{M7-01}}) : extraire `externalId` (idempotence), `amountCents`, `currency` (défaut EUR), `paymentMethod?`, `externalProductId?` (référence produit du catalogue provider — clé du mapping {{M7-04}}), `itemLabel?`, `occurredAt`. Extraction **tolérante** aux champs manquants (une vente sans `externalProductId` reste ingérée → deviendra une anomalie en {{M7-05}}).
- **Idempotence** : contrainte unique `(providerId, externalId)` (déjà en schéma). Rejeu d'un événement déjà ingéré → **200** no-op (pas de doublon).
- **Persistance** (append-only) `ExternalTransaction` : `providerId`, `externalId`, `kind = SALE`, `amountCents`, `currency`, `occurredAt`, `paymentMethod?`, `externalProductId?`, `rawPayload` (JSONB **brut intégral**), `status = UNMAPPED`, `memberId = null`.
- **Provider** : lookup par `kind` (`SUMUP`/`ZETTLE`) actif ; amorcer une ligne `ExternalProvider` par provider (seed idempotent) portant `webhookSecretRef`. Provider absent/inactif → `404`/`403` maîtrisé, sans 500 (réutiliser `WebhookProviderUnavailableError` M6-07).
- **Sécurité** : route publique **par conception** (la signature EST l'auth) ; ne jamais divulguer la raison exacte d'un rejet au-delà d'un code générique ; payload brut jamais renvoyé.

## Definition of Done
- [ ] Tests d'intégration (par provider) : signature valide → `ExternalTransaction` `SALE`/`UNMAPPED` persistée (raw + normalisé, `externalProductId` extrait) ; signature invalide/absente → **401**, aucune écriture ; **idempotence** (même `externalId` rejoué → 200, une seule ligne) ; vente sans `externalProductId` ingérée sans erreur ; rate-limit actif ; provider inactif géré sans 500
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés ; secrets lus **uniquement** via variable d'env
- [ ] Pas de régression sur les tests existants (M6-07 HelloAsso intact)
- [ ] Critère fonctionnel observable : POSTer une vente SumUp (puis Zettle) signée crée exactement une transaction externe `SALE` normalisée ; un rejeu ne crée pas de doublon ; une requête non signée est rejetée

## Dépendances
Bloqué par : {{M1-01}}, {{M6-07}}, {{M7-01}} — Bloque : {{M7-05}}
