---
labels: api, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-04 — api : module `members` (CRUD identité + rôles associatifs + statut de cotisation dérivé)

## Contexte
Cœur du fichier membres (§Membres & RGPD). On expose le CRUD de `Member` (identité, coordonnées, rôles associatifs, numéro d'adhérent), avec le **statut de cotisation dérivé** d'une période (M6-01/02) et l'**audit de toute lecture/écriture de donnée personnelle** (§6, helper {{M6-03}}). Matrice §3.5 : `membres` = CRUD pour `admin` et `rgpd` ; `brasseur`/`caisse` = aucun accès. SOURCE : `SPEC-ORCHESTRATION.md` §3.4/§3.5 ; `SPEC-FONCTIONNELLE.md` §Membres.

## Objectif
L'API permet de lister/rechercher, consulter, créer et éditer des membres ; chaque accès à une donnée personnelle est audité et le statut de cotisation est calculé à la lecture.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/members/{repository,service,schema,routes}.ts` (nouveau) + câblage `app.ts`, tests `apps/api/test/`. Consomme `@brasso/core` (schémas `memberCreate/Update`, `deriveMembershipStatus`) et `recordAudit` ({{M6-03}}).
- Hors périmètre explicite : consentements ({{M6-05}}), export/anonymisation ({{M6-06}}), rapprochement cotisation ({{M6-08}}), UI ({{M6-09}}). Ne pas dupliquer les schémas Zod (les importer de core).

## Spécification
- **Routes** (préfixe `/members`, RBAC `membres`) :
  - `GET /members` (`read`) — liste **paginée**, recherche `?search=` sur `lastName`/`firstName`/`memberNumber`/`email`, filtre `?membership=A_JOUR|EN_RETARD`. Statut **dérivé** par membre via `deriveMembershipStatus(lastContributionAt, settings.membershipPeriodDays, now)`. Réponse `{ members: MemberView[], total, limit, offset }`.
  - `GET /members/:id` (`read`) — détail (identité + rôles + statut dérivé + `lastContributionAt`). **Audite** `MEMBER_READ` (`memberId`, `userId`, `ip`) : lecture d'une donnée personnelle (§6).
  - `POST /members` (`create`) — `memberCreateSchema`. 201. `memberNumber` **unique** (409 `MEMBER_NUMBER_TAKEN` si collision). Audite `MEMBER_CREATE`.
  - `PATCH /members/:id` (`update`) — `memberUpdateSchema` (**rectification** RGPD). `memberNumber` immuable. Audite `MEMBER_UPDATE` (les champs modifiés dans `metadata`, sans recopier de PII sensible superflue). 404 si absent.
- **Statut dérivé** : la lecture recalcule toujours le statut (source de vérité = `lastContributionAt` + période) ; le champ stocké `membership` sert de cache aux filtres et est réaligné au rapprochement ({{M6-08}}). Une seule lecture `Settings` (période) par requête.
- **Erreurs typées** : `MemberNotFoundError` (404 `MEMBER_NOT_FOUND`), `MemberNumberTakenError` (409). Deny-by-default RBAC.
- Schéma module : `memberListQuery` (pagination + search + membership).

## Definition of Done
- [ ] Tests d'intégration : CRUD complet ; recherche multi-champ ; statut **dérivé** (A_JOUR si cotisation < période, EN_RETARD au-delà et si `lastContributionAt` null) ; `memberNumber` unique (409) ; **audit écrit** sur `GET /members/:id`, `POST`, `PATCH` (vérifié via le repo audit) ; RBAC (`admin`/`rgpd` OK, `brasseur`/`caisse` 403)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : créer un membre, l'éditer, le retrouver par recherche, voir son statut de cotisation évoluer selon la période ; chaque accès personnel laisse une trace d'audit

## Dépendances
Bloqué par : {{M6-01}}, {{M6-02}}, {{M6-03}} — Bloque : {{M6-05}}, {{M6-06}}, {{M6-08}}, {{M6-09}}
