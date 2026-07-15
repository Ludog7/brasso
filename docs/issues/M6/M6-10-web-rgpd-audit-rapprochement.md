---
labels: web, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-10 — web : outils RGPD, journal d'audit & rapprochement des cotisations

## Contexte
Second écran front M6, qui **boucle la démo** : outils RGPD (export/anonymisation, {{M6-06}}), consultation du **journal d'audit** ({{M6-03}}), et **rapprochement des cotisations** HelloAsso aux membres ({{M6-08}}) — rendant observable « adhésion → cotisation → statut à jour ». Matrice §3.5 : export/anonymisation réservés au rôle `rgpd` ; audit lisible par `admin`/`rgpd` ; rapprochement (met à jour l'adhésion) réservé aux habilités. Discipline : l'anonymisation est **irréversible** → confirmation explicite. SOURCE : `SPEC-FONCTIONNELLE.md` §Membres & RGPD, §Flux ; `SPEC-ORCHESTRATION.md` §3.4/§3.5/§6.

## Objectif
Un référent RGPD peut exporter/anonymiser un dossier et consulter l'audit ; un habilité peut rapprocher une cotisation en attente à un membre et le voir passer à jour.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/members/` (`RgpdActions.tsx`, `AnonymizeConfirmDialog.tsx`) + `apps/web/src/features/audit/` (`AuditLogView.tsx`, `hooks.ts`) + `apps/web/src/features/contributions/` (`ReconcileList.tsx`, `ReconcileDialog.tsx`, `hooks.ts`) + routes `routes/audit/` et intégration à l'écran membres/cotisations, `lib/api.ts` (`rgpdApi.exportMember`/`anonymizeMember`, `auditApi.list`, `contributionsApi.pending`/`reconcile`), tests `apps/web/src/test/`.
- Hors périmètre explicite : `IntegrationAlert`/dashboard anomalies complet (M7) ; toute logique métier (API M6-06/08). Réutiliser `DialogShell`/toasts/`canManageMembers` de {{M6-09}}.

## Spécification
- **RGPD (détail membre)** : bouton **Exporter** (`GET /members/:id/export` → **téléchargement** JSON côté navigateur) ; bouton **Anonymiser** ouvrant `AnonymizeConfirmDialog` (avertissement **irréversible** explicite, re-saisie/confirmation) → `POST /members/:id/anonymize`, puis rafraîchit la fiche (PII effacées). Actions visibles **uniquement** pour le rôle `rgpd`.
- **Journal d'audit** `AuditLogView` (route `/audit`) : liste paginée + filtres (membre, type de ressource, action, dates) via `GET /audit`. Visible pour `admin`/`rgpd` seulement. Lecture seule.
- **Rapprochement** `ReconcileList` : cotisations `UNMAPPED` (`GET /transactions?status=UNMAPPED&kind=MEMBERSHIP`) — montant, date, email payeur ; `ReconcileDialog` pour assigner à un membre (recherche) → `POST /transactions/:id/reconcile` ; à la réussite, le membre passe **A_JOUR** (badge mis à jour). Affiche l'état vide « aucune cotisation à rapprocher ».
- **A11y/atelier** : cibles ≥ 48 px, AA, mode sombre ; confirmation destructive non ambiguë ; aucun wording trompeur (l'anonymisation est présentée comme irréversible, pas « réversible »).

## Definition of Done
- [ ] Tests web (Vitest/RTL, faux `fetch`) : export déclenche un téléchargement (mock) ; flux d'anonymisation avec confirmation (POST + fiche rafraîchie) ; `RgpdActions` masquées hors `rgpd` ; `AuditLogView` rend + filtre les entrées, masqué hors `admin`/`rgpd` ; `ReconcileList` liste les cotisations et l'assignation fait passer le membre A_JOUR
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés (piège CRLF connu)
- [ ] Pas de régression sur les tests existants
- [ ] **Critère de démo M6** bouclé à l'écran : rapprocher une cotisation → statut membre à jour ; exporter puis anonymiser un dossier ; relire l'audit

## Dépendances
Bloqué par : {{M6-03}}, {{M6-06}}, {{M6-08}} — Bloque : —
