---
labels: api, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-05 — api : consentements RGPD historisés (append-only + résolution du courant)

## Contexte
Le RGPD by design impose des **consentements historisés** (§6) : communication, photos, notifications légales (`ConsentType`). Le modèle `MemberConsent` est **append-only** (une ligne par changement, §3.4) ; le consentement courant d'un `(memberId, type)` est la ligne la plus récente — logique pure déjà livrée par `resolveConsents` ({{M6-02}}). Ce ticket branche les routes de gestion sur le module `members` ({{M6-04}}), avec audit ({{M6-03}}). SOURCE : `SPEC-ORCHESTRATION.md` §3.4/§6 ; `SPEC-FONCTIONNELLE.md` §Membres (consentements).

## Objectif
L'API permet de consulter l'historique + l'état courant des consentements d'un membre et d'enregistrer un changement de consentement (octroi/retrait), tracé.

## Périmètre technique
- Fichiers/dossiers concernés : extension `apps/api/src/modules/members/{repository,service,schema,routes}.ts`, tests `apps/api/test/`. Consomme `resolveConsents`/`consentInputSchema` (core) et `recordAudit`.
- Hors périmètre explicite : export/anonymisation ({{M6-06}}), UI ({{M6-09}}). Le consentement est **append-only** : aucune route d'update/delete d'une ligne existante.

## Spécification
- **Routes** (RBAC `membres`) :
  - `GET /members/:id/consents` (`read`) — renvoie `{ current: Record<ConsentType, { granted, at } | null>, history: ConsentEventView[] }`. `current` via `resolveConsents` (dernier événement par type). `history` = toutes les lignes, `createdAt` desc. Audite `MEMBER_READ` (accès personnel) ou une action dédiée `CONSENT_READ`.
  - `POST /members/:id/consents` (`update`) — corps `consentInputSchema` (`{ type, granted }`). **Insère une nouvelle ligne** (append-only) datée `now` ; ne modifie jamais l'existant. 201 `{ event }`. Audite `CONSENT_CHANGE` (`memberId`, `type`, `granted` en `metadata`). 404 si membre absent.
- **Règle** : le « consentement courant » n'est jamais stocké dérivé — il se **recalcule** depuis l'historique (source de vérité append-only). Un retrait = une ligne `granted:false`, un ré-octroi = une ligne `granted:true`.
- Erreurs : `MemberNotFoundError` (404). Deny-by-default RBAC (mêmes droits que `membres`).

## Definition of Done
- [ ] Tests d'intégration : `POST` ajoute une ligne (append-only, l'ancienne subsiste) ; `GET` renvoie `current` = dernier événement par type + `history` complet trié ; séquence octroi→retrait→ré-octroi résout au dernier ; audit `CONSENT_CHANGE` écrit ; 404 membre inconnu ; RBAC
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : basculer un consentement d'un membre puis relire son état courant + l'historique complet, avec trace d'audit

## Dépendances
Bloqué par : {{M6-02}}, {{M6-03}}, {{M6-04}} — Bloque : {{M6-09}}
