---
labels: api, feature, P1
milestone: M4 — Jour J
---
# M4-07 — api : corrections densité pré-ébullition (aperçu + journalisation)

## Contexte
Exposer les propositions de correction (core M4-02) et **journaliser la décision** retenue (« Journalisation des décisions », `SPEC-FONCTIONNELLE.md`) dans `BatchCorrectionLog` (M4-03). Wording ADR-11 : aide à la décision, jamais prescriptif.

## Objectif
`POST /api/batches/:id/day/corrections/preview` (propositions chiffrées) et `POST /api/batches/:id/day/corrections` (journalise la décision retenue).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/batches/day.service.ts` (branche corrections), `day.routes.ts`.
- Hors périmètre explicite : calcul (core M4-02), UI (M4-13).

## Spécification
- `preview` (POST, sans écriture) : entrée = mesures pré-ébullition `{ measuredGravity, measuredVolumeL }`. Le service **reconstitue les cibles** depuis `recipeSnapshot` + profil (targetPreBoilGravity/volume, targetOg, evaporationRate, boilTime, atténuation attendue) et appelle `suggestPreBoilCorrections` (M4-02). Renvoie `{ deltaGravity, deltaOg, proposals }`.
- `corrections` (POST) : `{ stepId, type, payload }` → insère `BatchCorrectionLog` (`authorId` = utilisateur). **Append-only**, sans impact sur l'état de la machine (la correction est une décision tracée, pas une transition).
- RBAC `recettes:update`. Wording « aperçu / aide à la décision ».

## Definition of Done
- [ ] Tests d'intégration : `preview` renvoie des propositions pour une densité **basse** ; `corrections` crée une ligne `BatchCorrectionLog` ; RBAC
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une mesure pré-ébullition sous la cible produit des corrections et la décision retenue est tracée

## Dépendances
Bloqué par : {{M4-02}}, {{M4-03}}, {{M4-05}} — Bloque : {{M4-13}}
