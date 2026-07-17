---
labels: docs, chore, P0
milestone: M8 — Durcissement & mise en prod
---
# M8-04 — docs : runbooks d'exploitation + installation from scratch

## Contexte
La démo de M8 exige une **« installation from scratch documentée »** (SPEC-ORCHESTRATION §4). Ce ticket produit les **runbooks d'exploitation** : les procédures qu'un opérateur (Ludo, ou un successeur) suit pour installer, restaurer, mettre à jour et dépanner Brasso en production, sans savoir implicite. Il s'appuie sur le socle Docker Compose (app + postgres + caddy, M0) et sur les scripts de sauvegarde {{M8-03}}. SOURCE : `SPEC-ORCHESTRATION.md` §4, §1 (stack), §6 (sécurité/RGPD) ; `docs/DEV.md` (manuel dev, à ne pas dupliquer).

## Objectif
`docs/RUNBOOKS.md` (ou `docs/ops/`) permet d'installer Brasso from scratch, de restaurer une sauvegarde et de gérer les incidents courants en suivant des étapes explicites et vérifiées.

## Périmètre technique
- Fichiers/dossiers concernés : `docs/RUNBOOKS.md` (ou dossier `docs/ops/` avec un fichier par procédure) ; liens croisés depuis `docs/DEV.md` et le `README` racine si pertinent.
- Hors périmètre explicite : les scripts eux-mêmes (sauvegarde {{M8-03}}, déjà livrés) ; la doc de développement (`docs/DEV.md`, existante — on **référence**, on ne recopie pas) ; l'infrastructure d'hébergement concrète (fournisseur, DNS) qui reste au choix de l'exploitant.

## Spécification
Runbooks couvrant au minimum :
- **Installation from scratch** : prérequis, secrets à fournir (variables d'env, `.env`), `docker compose up`, application des migrations Prisma, seed initial (compte admin), vérification de santé (login + une route protégée), configuration Caddy/TLS.
- **Restauration depuis sauvegarde** : depuis un dump {{M8-03}} vers une base vierge, remontée du service, vérification post-restauration (les contrôles de `verify-restore`).
- **Rotation des secrets** : secrets de session, secrets de webhooks (`*_WEBHOOK_SECRET` HelloAsso/SumUp/Zettle), procédure sans interruption.
- **Migrations / mise à jour applicative** : déployer une nouvelle version, appliquer les migrations, rollback documenté (ne jamais éditer une migration mergée — CLAUDE.md).
- **Incident courant** : webhook en échec (lien vers le dashboard anomalies M7), base injoignable, certificat, logs à consulter.
- **RGPD/exploitation** : où vivent les données personnelles, accès aux dumps, procédure d'anonymisation (module M6) en exploitation.

Chaque procédure : préconditions → étapes numérotées → vérification finale → en cas d'échec.

## Definition of Done
- [ ] `docs/RUNBOOKS.md` (ou `docs/ops/`) couvre : installation from scratch, restauration, rotation des secrets, migrations/màj, incidents courants, note RGPD
- [ ] Procédures **suivies pas à pas** au moins une fois (install from scratch + restauration effectivement rejouées, ce qui valide la démo M8)
- [ ] Références croisées vers `docs/DEV.md` et {{M8-03}} ; aucun secret réel dans la doc
- [ ] Pas de régression (docs uniquement)
- [ ] Critère observable : un opérateur installe Brasso from scratch **et** restaure une sauvegarde en suivant uniquement les runbooks

## Dépendances
Bloqué par : {{M8-03}} — Bloque : —
