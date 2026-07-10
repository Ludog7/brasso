---
labels: web, feature, P0
milestone: M4 — Jour J
---
# M4-12 — web : mode manuel « Forcer l'étape » (motif + auteur → DeviationLog)

## Contexte
Bouton « **Forcer l'étape** » sur chaque étape (`SPEC-FONCTIONNELLE.md` « Mode manuel ») : passer à l'étape suivante **malgré des conditions incomplètes** (panne tablette, sonde HS, oubli de validation) en **générant automatiquement** une entrée au journal d'écart de procédure (auteur, date/heure, étape, motif).

## Objectif
Une action « Forcer l'étape » (`FORCE_STEP`) **exigeant un motif**, produisant un `DeviationLog`, avec consultation du journal d'écart du batch.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/day/` (`ForceStepDialog`, `DeviationJournal`).
- Hors périmètre explicite : transitions normales (M4-09).

## Spécification
- Bouton « Forcer l'étape » disponible quel que soit le statut (sauf brassin terminé) ; ouvre une **modale exigeant un motif non vide** (auteur = utilisateur courant). Envoi `FORCE_STEP` → avance + `DeviationLog`. **Confirmation explicite** (action à conséquence).
- Journal d'écart : liste des `DeviationLog` du batch (étape, phase, motif, auteur, date) en **lecture seule**.
- Wording **neutre** (pas de blâme) : l'écart est une **trace**, pas une erreur bloquante.

## Definition of Done
- [ ] Tests composant : forcer **sans motif** impossible ; `FORCE_STEP` avance et l'entrée apparaît au journal ; journal listé en lecture seule
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : forcer l'étape d'empâtage crée une entrée tracée (auteur, motif, date)

## Dépendances
Bloqué par : {{M4-05}}, {{M4-08}} — Bloque : —
