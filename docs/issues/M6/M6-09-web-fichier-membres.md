---
labels: web, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-09 — web : fichier membres (liste/recherche, création/édition, rôles, statut, consentements)

## Contexte
Premier écran front M6 : le **fichier membres** (§Membres & RGPD). Il consomme le CRUD ({{M6-04}}) et les consentements ({{M6-05}}). Matrice §3.5 : seuls `admin` et `rgpd` accèdent aux membres → l'entrée et les actions sont **masquées** pour `brasseur`/`caisse` (l'API reste l'autorité). Minimisation (§6) : la date de naissance est optionnelle et signalée comme telle. **Nouveau domaine front** : réutiliser les patterns d'un feature web existant (ex. `features/stock` livré en M5-07, ou l'éditeur de recettes) pour TanStack Query / RBAC UI / shadcn / tests. SOURCE : `SPEC-FONCTIONNELLE.md` §Membres ; `SPEC-ORCHESTRATION.md` §3.5/§6 ; UI atelier §6 (cibles ≥ 48 px, mode sombre, AA).

## Objectif
Un `admin`/`rgpd` peut lister/rechercher les membres, en créer/éditer, gérer leurs rôles et consentements, et voir leur statut de cotisation.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/members/` (`hooks.ts` TanStack Query + `memberKeys`, `labels.ts`, `MemberList.tsx`, `MemberFormDialog.tsx`, `ConsentPanel.tsx`, `MembershipBadge.tsx`) + route `apps/web/src/routes/members/MembersPage.tsx` + entrée de navigation (masquée hors rôle), `apps/web/src/lib/api.ts` (`membersApi` + types `Member`/`ConsentState`), tests `apps/web/src/test/members.test.tsx`.
- Hors périmètre explicite : export/anonymisation + audit + rapprochement ({{M6-10}}). Ne pas ré-implémenter le `DialogShell`/toasts si mutualisables (réutiliser l'existant).

## Spécification
- **`membersApi`** (`lib/api.ts`) : `list({search?, membership?})`, `get(id)`, `create(input)`, `update(id, input)`, `consents(id)`, `setConsent(id, {type, granted})`. Types miroir des vues API (dates ISO, statut dérivé).
- **`MemberList`** : tableau paginé, champ de recherche (nom/numéro/email), `MembershipBadge` (A_JOUR = vert / EN_RETARD = ambre) ; ligne cliquable → détail/édition.
- **`MemberFormDialog`** : création/édition (identité, coordonnées, `memberNumber` **verrouillé en édition**, rôles associatifs multi-select). `birthDate` **optionnelle** avec mention de minimisation (« renseignez uniquement si nécessaire »). Validation alignée sur les schémas core.
- **`ConsentPanel`** : les 3 types (`COMMUNICATION`/`PHOTOS`/`NOTIFICATIONS_LEGALES`) avec bascule → `POST` d'un événement ; affiche l'**état courant** + un historique lisible (append-only : chaque bascule ajoute une ligne).
- **RBAC UI** : `canManageMembers(roles) = admin || rgpd` masque l'entrée de nav et les actions ; un utilisateur sans droit ne voit pas l'écran (l'API renverrait 403 de toute façon).
- **A11y/atelier** : cibles ≥ 48 px, contraste AA, mode sombre, pas de drag-and-drop.

## Definition of Done
- [ ] Tests web (Vitest/RTL, faux `fetch`) : liste + recherche ; création (POST) puis édition (PATCH, `memberNumber` verrouillé) ; bascule de consentement (POST événement) et relecture de l'état courant ; `MembershipBadge` A_JOUR vs EN_RETARD ; RBAC UI (écran masqué hors `admin`/`rgpd`)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés (piège CRLF connu)
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : créer un membre, l'éditer, gérer ses consentements, voir son statut de cotisation — accessible aux seuls rôles habilités

## Dépendances
Bloqué par : {{M6-04}}, {{M6-05}} — Bloque : —
