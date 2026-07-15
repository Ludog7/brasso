---
labels: feature, P0
milestone: M6 — Membres & RGPD
epic: true
---
# M6 — Membres & RGPD (epic)

## Contexte
Issue chapeau du milestone M6 (SPEC-ORCHESTRATION §4 ; §3.4 membres/rôles/RGPD ; §3.6 hub caisse pour la fondation webhook ; SPEC-FONCTIONNELLE §Membres & RGPD). On rend vivant le modèle **déjà posé en M1** (`Member`, `MemberConsent` append-only, `AuditLog` verrouillé par trigger, `ExternalProvider`/`ExternalTransaction`) et la matrice RBAC **déjà figée** (`membres` CRUD admin/rgpd + `export`/`anonymize` rgpd, `auditLog` R admin/rgpd, `transactions`). **Un seul changement de schéma** (M6-01) : durée d'adhésion configurable (`Settings`) + date de dernière cotisation (`Member`), car le statut de cotisation est **dérivé d'une période** (ADR-01 : aucune constante métier hardcodée). Le reste = core (helpers purs RGPD) → api (audit, CRUD, consentements, export/anonymisation, **webhook HelloAsso**, rapprochement) → web (fichier membres, RGPD/audit/rapprochement). La **fondation webhook** (signature abstraite par provider, défaut HMAC, idempotence) est réutilisée par M7 (SumUp/Zettle). Découpage core→api→web, sans savoir implicite.

## Critère de démo
Cycle complet **adhésion → cotisation HelloAsso → statut à jour** : un membre est créé (consentements historisés, accès personnels audités) ; une **cotisation HelloAsso** signée est ingérée (transaction externe append-only, idempotente), **rapprochée** au membre (auto par email, ou manuellement), ce qui pose sa dernière cotisation et le fait passer **A_JOUR** — visible à l'écran. Un référent RGPD peut **exporter** le dossier d'un membre puis l'**anonymiser** de façon irréversible (PII effacées, agrégats comptables et piste d'audit préservés), et consulter le **journal d'audit**.

## Sous-tickets
{{CHECKLIST}}

## Dépendances
Bloqué par la validation de la démo M5. S'appuie sur le schéma M1 (Member/Consent/AuditLog/External*) et sur la matrice RBAC figée (§3.5). Fournit à **M7** la fondation d'ingestion webhook (vérification de signature abstraite, idempotence, `ExternalTransaction` append-only) que le hub caisse SumUp/Zettle réutilisera pour les ventes.
