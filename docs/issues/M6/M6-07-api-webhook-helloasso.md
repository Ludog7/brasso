---
labels: api, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-07 — api : webhook HelloAsso (ingestion signée, idempotente, append-only)

## Contexte
Les cotisations arrivent par **webhook HelloAsso** (§Intégrations, §Flux). ADR-09 : les transactions externes sont **read-only**, ingérées et **jamais modifiées** (`ExternalTransaction` append-only, verrouillée par trigger, payload brut conservé). Ce ticket pose la **fondation webhook générique** (vérification de signature, idempotence, persistance brute+normalisée) que **M7 réutilisera** pour SumUp/Zettle. Exigences transverses (§6) : **rate-limit** sur les webhooks, **secrets uniquement en variables d'environnement**, **webhooks vérifiés par signature**. Décision de cadrage M6-00 : vérification de signature **abstraite par provider**, défaut **HMAC-SHA256** (testable ; le schéma HelloAsso réel n'est pas testable sans compte). SOURCE : `SPEC-ORCHESTRATION.md` §3.6 (ADR-09), §6 ; `SPEC-FONCTIONNELLE.md` §Intégrations.

## Objectif
`POST /webhooks/helloasso` accepte un événement de cotisation signé, le persiste une seule fois (idempotent) en `ExternalTransaction` normalisée (`MEMBERSHIP`), et rejette toute requête non signée/rejouée.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/webhooks/{routes,service,repository,schema}.ts` (nouveau module) + abstraction `verifyWebhookSignature` (stratégie par `ExternalProviderKind`) + accès au **corps brut** (raw body) pour la route webhook, câblage `app.ts` (route publique + rate-limit), amorçage d'un `ExternalProvider` `HELLOASSO` (seed ou config), tests `apps/api/test/`.
- Hors périmètre explicite : **rapprochement** cotisation→membre ({{M6-08}} branche sa logique sur l'ingestion) ; connecteurs SumUp/Zettle (M7, réutiliseront `verifyWebhookSignature`) ; `IntegrationAlert` (M7). Ne pas créer de mouvement de stock (les cotisations ne touchent pas le stock).

## Spécification
- **Route publique** `POST /webhooks/helloasso` — **non authentifiée** (pas de session) mais **vérifiée par signature** et **rate-limitée** (réutiliser le rate-limit existant du socle, appliqué au login). Accès au **corps brut** requis (la signature porte sur les octets exacts) : parser/hook dédié à cette route, sans casser le parsing JSON global.
- **Vérification de signature** `verifyWebhookSignature(provider, rawBody, headers)` — stratégie par `provider.kind` ; **défaut HMAC-SHA256** : `hmac(secret, rawBody)` comparé (comparaison à temps constant) à l'en-tête de signature. **Secret** résolu depuis une **variable d'environnement** nommée par `provider.webhookSecretRef` (jamais en base). Échec → `401 WEBHOOK_SIGNATURE_INVALID`, aucune écriture.
- **Idempotence** : `externalId` natif extrait du payload ; contrainte unique `(providerId, externalId)` (déjà en schéma). Rejeu d'un événement déjà ingéré → **200** no-op (pas de doublon). 
- **Persistance** (append-only) `ExternalTransaction` : `providerId` (provider `HELLOASSO`), `externalId`, `kind = MEMBERSHIP`, `amountCents`, `currency` (défaut EUR), `occurredAt`, `paymentMethod?`, `rawPayload` (JSONB **brut intégral**), `status = UNMAPPED` (le rapprochement viendra en {{M6-08}}), `memberId = null`. Champs normalisés extraits défensivement du payload (email du payeur conservé au minimum dans `rawPayload`, exploité par le rapprochement).
- **Provider** : lookup par `kind = HELLOASSO` (+ `label`) actif ; amorcer une ligne `ExternalProvider` HelloAsso (seed idempotent) portant `webhookSecretRef` = nom de la variable d'env. Provider absent/inactif → `404`/`403` maîtrisé, sans 500.
- **Sécurité** : deny-by-default ailleurs, mais cette route est **publique par conception** — la signature EST l'authentification. Ne jamais divulguer la raison exacte d'un rejet au-delà d'un code générique. Payload brut jamais renvoyé.

## Definition of Done
- [ ] Tests d'intégration : signature valide → `ExternalTransaction` `MEMBERSHIP` persistée (raw + normalisé) ; signature invalide/absente → **401**, aucune écriture ; **idempotence** (même `externalId` rejoué → 200, une seule ligne) ; rate-limit actif ; provider inactif géré sans 500
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés ; secret lu **uniquement** via variable d'env
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : POSTer un événement de cotisation HelloAsso signé crée exactement une transaction externe normalisée ; un rejeu ne crée pas de doublon ; une requête non signée est rejetée

## Dépendances
Bloqué par : {{M1-01}}, {{M6-02}} — Bloque : {{M6-08}}
