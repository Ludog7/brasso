---
labels: docs, regulatory, P0
milestone: M8 — Durcissement & mise en prod
---
# M8-09 — regulatory : REG-02 — relecture pH / stabilisation (hygiène alimentaire, HACCP)

## Contexte
Issue réglementaire **REG-02** explicitement prévue par la spec (SPEC-ORCHESTRATION §0.2/§0.3 : « relecture par une personne compétente en hygiène alimentaire (HACCP) du wording et de la logique d'alerte pH/stabilisation → issue REG-02, milestone M8 »). **Prérequis mise en production**, pas dev. Le wording est déjà cadré par **ADR-11** (les écrans pH/stabilisation disent « **indicateur** d'aide à la décision », jamais « conforme »/« sûr », avec disclaimer permanent). Ce ticket **constitue le dossier** de relecture et **trace la validation** par une personne compétente HACCP. SOURCE : `SPEC-ORCHESTRATION.md` §0.2/§0.3, ADR-11 (wording sécurité alimentaire), §6 ; `SPEC-FONCTIONNELLE.md` §pH/stabilisation ; `CLAUDE.md` (wording ADR-11).

## Objectif
Un dossier rassemble le wording et la logique d'alerte pH/stabilisation en vue d'une relecture HACCP, et la validation (ou les réserves) est tracée.

## Périmètre technique
- Fichiers/dossiers concernés : `docs/regulatory/REG-02-ph-haccp.md` (dossier + inventaire des écrans/wordings + checklist + traçabilité). Documentation uniquement.
- Hors périmètre explicite : toute modification du wording en dur (déjà conforme ADR-11 ; un correctif éventuel **issu** de la relecture fera l'objet d'un ticket dédié) ; l'obtention effective de l'avis (acte externe).

## Spécification
Le dossier doit contenir :
- **Inventaire** des écrans et messages pH/stabilisation existants (référencer les composants front et le disclaimer permanent ADR-11 : « *Indicateur d'aide à la décision — ne remplace pas une validation d'hygiène alimentaire professionnelle.* »).
- **Logique d'alerte** : ce qui est calculé (indicateur), ce qui n'est **jamais** affirmé (« conforme »/« sûr »), les seuils/bornes et leur justification, l'absence de décision automatique de sécurité alimentaire.
- **Points à faire relire** par la personne compétente HACCP : justesse et prudence du wording, pertinence de la logique d'alerte, risques de mauvaise interprétation en atelier.
- **Traçabilité** : date, relecteur, verdict, réserves → **gate go-live** ; toute correction demandée devient un ticket `type:regulatory`/`bug` distinct.

## Definition of Done
- [ ] `docs/regulatory/REG-02-ph-haccp.md` : inventaire des écrans/wordings pH + logique d'alerte + rappel ADR-11 + questions au relecteur + section de traçabilité
- [ ] Checklist de mise en prod mentionnant REG-02 comme **gate** bloquant le go-live tant que non validé
- [ ] Pas de régression (docs uniquement)
- [ ] Critère observable : le dossier est autoportant et prêt pour une relecture HACCP ; la décision se consigne dans le fichier

## Dépendances
Bloqué par : validation de la démo M7 (module pH/stabilisation M2–M4 livré, ADR-11) — Bloque : mise en production
