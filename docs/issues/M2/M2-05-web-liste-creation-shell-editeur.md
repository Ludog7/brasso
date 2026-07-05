---
labels: web, feature, P0
milestone: M2 — Recettes
---
# M2-05 — web : liste des recettes + création + shell éditeur

## Contexte
Spec fonctionnelle « Comportement UI » : à la création de recette, le choix du type de boisson détermine le moteur proposé. Premier écran métier du front (M0-08) ; les éditeurs par moteur (M2-06/07/08) viendront se brancher dans ce shell.

## Objectif
Parcours web : lister les recettes, en créer une (type de boisson → moteur), ouvrir un shell d'éditeur commun qui sauvegarde le DRAFT via l'API.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/routes/recipes/*`, `apps/web/src/features/recipes/*`, hooks TanStack Query dans `apps/web/src/lib/`.
- Hors périmètre explicite : formulaires spécifiques par moteur (M2-06/07/08), publication/versions (M2-09), import/export (M2-12).

## Spécification
- `/recipes` : liste (cards), filtres moteur + statut, badge statut/version, tri par mise à jour ; bouton « Nouvelle recette ».
- Création : choix du **type de boisson** (BIERE, GINGER_BEER, HYDROMEL, KOMBUCHA, FERMENTE_SANS_ALCOOL, LIMONADE…) → moteur proposé (BIERE→BEER ; fermentés alternatifs→ALT_FERMENTED ; non fermentés→SOFT_DRINK), nom obligatoire → `POST /api/recipes` → redirection éditeur.
- Shell éditeur `/recipes/:id/edit` : en-tête (nom éditable, moteur, statut, version), zone de contenu par moteur (slot vide à ce stade avec formulaire commun : nom, description, volume cible), sauvegarde explicite (`PATCH`), indicateur « modifications non enregistrées », garde de navigation si dirty.
- TanStack Query : hooks `useRecipes`, `useRecipe`, mutations create/update avec invalidation.
- Exigences UI atelier (§6) : cibles tactiles ≥ 48 px, contraste AA, mode sombre par défaut, zéro drag-and-drop.

## Definition of Done
- [ ] Tests composants (Vitest + Testing Library) : liste, création avec mapping type→moteur, sauvegarde du shell
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : créer une recette de chaque type depuis l'UI et la retrouver dans la liste après reload

## Dépendances
Bloqué par : {{M2-01}}, {{M0-08}} — Bloque : {{M2-06}}, {{M2-07}}, {{M2-08}}, {{M2-09}}
