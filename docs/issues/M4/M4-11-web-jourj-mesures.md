---
labels: web, feature, P1
milestone: M4 — Jour J
---
# M4-11 — web : saisie de mesures + alertes d'écart vs modèle

## Contexte
Chaque étape peut exiger des **mesures** (densité/volume/température/pH) ; **alertes** en cas d'écart au modèle (`SPEC-FONCTIONNELLE.md` « Gestion des alertes »). Les mesures alimentent la même machine ({{M1-13}} `RECORD_MEASUREMENT`) et le journal du batch (M3-09).

## Objectif
Un formulaire de saisie des mesures de l'étape (`RECORD_MEASUREMENT`) rappelant les `requiredMeasurements` et affichant une **alerte d'écart** au modèle (valeurs du snapshot).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/day/` (`MeasurementEntry`, `DeviationHint`).
- Hors périmètre explicite : corrections densité **chiffrées** (M4-13), journal de mesures du détail batch (déjà M3-09).

## Spécification
- Rendre les `requiredMeasurements` de l'étape courante ; saisie → `RECORD_MEASUREMENT` (`kind`/`value`). Afficher les mesures déjà saisies pour l'étape (`measurementsForStep`). Clavier numérique, gros contrôles tactiles.
- **Alerte d'écart** : comparer la mesure aux valeurs modèle du snapshot (OG / volumes cibles) ; badge indicatif « écart de X » (wording aide à la décision). En mode normal, `VALIDATE_STEP` n'est proposé que si les mesures **requises** sont présentes (sinon inciter à « Forcer l'étape », M4-12).

## Definition of Done
- [ ] Tests composant : saisie envoie `RECORD_MEASUREMENT` ; mesures requises manquantes → validation normale bloquée ; alerte d'écart affichée quand la valeur s'écarte du modèle
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : saisir une densité pré-ébullition hors modèle affiche une alerte d'écart

## Dépendances
Bloqué par : {{M4-05}}, {{M4-08}} — Bloque : —
