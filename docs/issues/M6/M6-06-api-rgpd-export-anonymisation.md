---
labels: api, regulatory, P0
milestone: M6 — Membres & RGPD
---
# M6-06 — api : RGPD — export du dossier + anonymisation/pseudonymisation

## Contexte
Le module membres doit **répondre aux demandes RGPD** d'accès et de suppression (§Membres & RGPD), « avec prise en compte des contraintes de conservation des données comptables ». La matrice §3.5 réserve `export` et `anonymize` au **seul rôle `rgpd`** (séparation des pouvoirs : l'`admin` gère les membres mais ne peut ni exporter ni anonymiser). La **pseudonymisation** remplace l'identité en **conservant les agrégats comptables** (§3.4 ; l'`AuditLog.memberId` et `ExternalTransaction.memberId` sont des scalaires **sans FK** → ils survivent). Logique pure `buildMemberExport`/`anonymizeMember` déjà livrée ({{M6-02}}). SOURCE : `SPEC-ORCHESTRATION.md` §3.4/§3.5/§6.

## Objectif
Un référent RGPD peut exporter le dossier complet d'un membre (demande d'accès) et l'anonymiser de façon irréversible (droit à l'effacement), tout en préservant les agrégats comptables et la piste d'audit.

## Périmètre technique
- Fichiers/dossiers concernés : extension `apps/api/src/modules/members/{repository,service,schema,routes}.ts`, tests `apps/api/test/`. Consomme `buildMemberExport`/`anonymizeMember` (core), `recordAudit` ({{M6-03}}).
- Hors périmètre explicite : rectification = `PATCH` ({{M6-04}}) ; UI ({{M6-10}}) ; suppression physique des lignes comptables (**interdite** — on pseudonymise, on ne détruit pas les agrégats).

## Spécification
- **`GET /members/:id/export`** (RBAC `membres`, action `export`) — assemble le **dossier portable** via `buildMemberExport` : identité, consentements (courants + historique), cotisations rapprochées (montant/date/référence depuis `ExternalTransaction` `MEMBERSHIP` du membre), entrées d'`AuditLog` liées (`memberId`). Réponse JSON (`content-type application/json`, en-tête favorisant le téléchargement côté UI). Audite `MEMBER_EXPORT`. 404 si absent.
- **`POST /members/:id/anonymize`** (RBAC `membres`, action `anonymize`) — applique le **patch `anonymizeMember`** (efface `firstName`/`lastName` remplacés par un pseudonyme, `email`/`phone`/`address`/`birthDate` → `null`) ; **conserve** `memberNumber`, `membership`, `roles` et **toutes** les lignes comptables/audit (agrégats intacts). Délie le compte `User` associé si présent (`memberId = null`, sans casser l'audit). **Irréversible** : un 2ᵉ appel sur un membre déjà anonymisé → `409 MEMBER_ALREADY_ANONYMIZED` (drapeau dérivé : PII déjà nulles / marqueur). Audite `MEMBER_ANONYMIZE` (**avant** effacement, pour tracer qui/quand ; l'audit survit car `memberId` scalaire). Transactionnel. 404 si absent.
- **Sécurité/discipline** : deny-by-default ; `admin` **n'a pas** `export`/`anonymize` (matrice) → 403. Ne jamais logguer de PII en clair dans `metadata` d'audit.

## Definition of Done
- [ ] Tests d'intégration : `GET /export` renvoie un dossier complet (identité + consentements + cotisations + audit) ; RBAC (`rgpd` OK, `admin` **403**, autres 403) ; `POST /anonymize` efface la PII, **préserve** `memberNumber`/agrégats/audit, délie le `User`, est **irréversible** (409 au 2ᵉ appel), audite `MEMBER_ANONYMIZE` ; 404 membre inconnu
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : exporter le dossier d'un membre puis l'anonymiser → sa PII disparaît, ses cotisations/agrégats et la piste d'audit demeurent

## Dépendances
Bloqué par : {{M6-02}}, {{M6-03}}, {{M6-04}} — Bloque : {{M6-10}}
