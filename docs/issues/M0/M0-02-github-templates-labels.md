---
labels: docs, chore, P1
milestone: M0 — Socle
---
# M0-02 — Templates GitHub, labels, script d'amorçage des issues

## Contexte
Formalise le process d'orchestration GitHub (SPEC-ORCHESTRATION §5). Une partie de ce ticket est amorcée manuellement au lancement (templates + script + tickets M0/M1) ; ce ticket vérifie, complète et documente l'ensemble pour qu'il soit reproductible.

## Objectif
Le repo dispose des templates d'issues/PR, du jeu de labels complet et d'un script `bootstrap-issues.sh` idempotent qui (re)crée labels, milestones et issues depuis `docs/issues/`.

## Périmètre technique
- Fichiers/dossiers concernés :
  - `.github/ISSUE_TEMPLATE/{feature,bug,adr}.yml`, `.github/pull_request_template.md`
  - `scripts/bootstrap-issues.sh`
  - `docs/issues/M0/*.md`, `docs/issues/M1/*.md`
- Hors périmètre explicite : workflows CI (M0-09).

## Spécification
- Labels (§5.1) : domaine `core|api|web|db|infra|docs`, type `feature|bug|adr|regulatory|chore`, priorité `P0|P1|P2`, statut `blocked`. Couleurs distinctes et cohérentes.
- Milestones M0→M8 avec descriptions = critères de démo du tableau §4.
- Format de ticket conforme au template §5.2 (Contexte / Objectif / Périmètre / Spécification / DoD / Dépendances).
- Script idempotent : réexécutable sans doublon (labels `--force`, milestones et issues vérifiés par titre avant création). Compatible **Git Bash** (poste Windows, CLAUDE.md).
- Le script résout les dépendances `{{Mx-yy}}` en vrais numéros d'issue après création, et crée les epics chapeau par milestone.

## Definition of Done
- [ ] Templates valides (rendus corrects dans l'UI GitHub)
- [ ] `scripts/bootstrap-issues.sh` réexécutable sans créer de doublons
- [ ] Labels + milestones + issues M0/M1 présents et cohérents
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : un `gh issue list` montre les tickets M0/M1 avec labels et milestones corrects

## Dépendances
Bloqué par : — — Bloque : —
