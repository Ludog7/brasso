---
labels: web, feature, P1
milestone: M4 — Jour J
---
# M4-13 — web : corrections densité pré-ébullition (impact estimé + journalisation)

## Contexte
Sur la mesure densité/volume **pré-ébullition**, proposer des corrections **chiffrées** (allonger l'ébullition, ajouter sucre/extrait) avec **impact estimé DI/ABV**, et **journaliser la décision** retenue (core M4-02, api M4-07 ; `SPEC-FONCTIONNELLE.md`). Wording ADR-11 : aide à la décision, jamais prescriptif.

## Objectif
Un panneau de corrections à l'étape `LAUTER` / pré-ébullition affichant les propositions (preview M4-07) et permettant de **journaliser** la décision retenue.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/day/` (`PreBoilCorrections`).
- Hors périmètre explicite : calcul (core M4-02), autres phases.

## Spécification
- Déclenché quand une densité/volume pré-ébullition est saisie (M4-11) et **s'écarte** du modèle. Appelle `POST /day/corrections/preview` → affiche l'écart + les propositions : « **+X min d'ébullition** → OG ≈ …, ABV ≈ … » et « **+Y kg sucre/extrait** → OG ≈ …, ABV ≈ … ». Comparaison au modèle claire.
- Bouton « **Enregistrer la décision** » → `POST /day/corrections` (`type` + `payload`). Trace visible. Wording « aperçu / aide à la décision », **jamais** « corrige » / « garantit ».

## Definition of Done
- [ ] Tests composant : preview affiché pour une densité **basse** ; sélection + enregistrement appelle l'API ; wording indicatif respecté (ADR-11)
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : densité pré-ébullition basse → propositions chiffrées + décision tracée

## Dépendances
Bloqué par : {{M4-07}}, {{M4-08}} — Bloque : —
