---
labels: web, feature, P1
milestone: M8 — Durcissement & mise en prod
---
# M8-02 — web : page « Calculateurs » autonomes (starter, eau, dilution, BIAB)

## Contexte
Volet UI des **calculateurs d'atelier** de M8 (SPEC-ORCHESTRATION §4). Une page dédiée expose les quatre calculateurs purs livrés en {{M8-01}} sous une forme utilisable pendant un brassage : saisie manuelle, résultat immédiat, **aucune persistance** ni lien à une recette/un batch. UI atelier (§6 exigences transverses) : cibles ≥ 48 px, contraste AA, mode sombre. SOURCE : `SPEC-ORCHESTRATION.md` §4, §6.

## Objectif
Une page `/calculators` propose les 4 calculateurs (starter, eau, dilution, BIAB) ; chaque saisie recalcule instantanément le résultat via `@brasso/core`.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/calculators/` (un composant par calculateur : `StarterCalculator.tsx`, `WaterCalculator.tsx`, `DilutionCalculator.tsx`, `BiabCalculator.tsx`, + `labels.ts`) ; route `apps/web/src/routes/calculators/CalculatorsPage.tsx` (dans `AppShell`) ; entrée `App.tsx` + carte de nav sur `HomePage` ; tests `apps/web/src/test/calculators.test.tsx`.
- Hors périmètre explicite : les formules (portées par `@brasso/core` {{M8-01}}) ; toute écriture serveur / route API (calcul **100 % client**, ADR-03) ; import depuis une recette ou un batch.

## Spécification
- **Rendu** : page à onglets ou sections (une par calculateur). Chaque calculateur = un petit formulaire contrôlé (Zustand local ou `useState`) qui appelle la fonction pure `@brasso/core` correspondante à chaque changement et affiche le résultat (recalcul synchrone, pas de requête réseau).
- **Unités** : saisie/affichage en **unités utilisateur** (°C, L, kg, SG `1.052`, € si applicable), conversions vers/depuis les unités internes **uniquement** via les helpers `core`/`units` — aucune arithmétique d'unité en dur dans le web.
- **Validation** : réutiliser les schémas Zod d'entrée de {{M8-01}} pour signaler les saisies invalides (message clair, pas de crash) ; borner les entrées aberrantes.
- **Starter** : afficher cellules requises / disponibles / déficit + taille de pied de cuve recommandée, avec une mention « estimation » (aide à la décision, pas une garantie).
- **A11y/atelier** : `<label>` associés, cibles ≥ 48 px, contraste AA, navigable au clavier, mode sombre.

## Definition of Done
- [ ] Tests web (Vitest/RTL) : chaque calculateur rend un résultat cohérent pour une saisie de référence (alignée sur les valeurs FORMULES de {{M8-01}}) ; une saisie invalide affiche un message sans planter ; recalcul à la modification d'une entrée
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère observable : depuis `/calculators`, saisir des valeurs et lire un résultat juste pour les 4 calculateurs, sans requête réseau

## Dépendances
Bloqué par : {{M8-01}} — Bloque : —
