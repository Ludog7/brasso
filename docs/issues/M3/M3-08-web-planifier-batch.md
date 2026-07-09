---
labels: web, feature, P0
milestone: M3 — Équipements & batchs
---
# M3-08 — web : planifier un batch (critère de démo M3)

## Contexte
**Critère de démo M3** (SPEC-ORCHESTRATION §4) : « Planifier un batch depuis une recette publiée, stock réservé ». Cet écran assemble tout M3 : recette publiée + profil d'équipement (M3-03/07) + plan d'eau `core` (M3-01) + réservation de stock (M3-05). Cible **tablette**.

## Objectif
Depuis une recette **PUBLISHED**, l'utilisateur choisit un profil d'équipement, visualise l'**aperçu** du plan d'eau/volumes et du stock qui sera réservé, puis crée le batch (numéro attribué) et arrive sur son détail.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/routes/batches/*` (nouveau), `apps/web/src/features/batches/*`, `lib/api.ts` (`batchesApi`), hooks, tests composants.
- Réutilise `@brasso/core` (`computeBrewWaterPlan`, M3-01) côté front pour l'aperçu temps réel ; `useRecipe` (M2) ; `equipmentApi` (M3-03).
- Point d'entrée : bouton « Planifier un batch » sur la page détail d'une recette **publiée** (M2-09).
- Hors périmètre explicite : suivi/mesures (M3-09), graphes (M3-10), Jour J (M4).

## Spécification
- Formulaire : sélection du profil d'équipement (liste active M3-03), date planifiée optionnelle. Aperçu **temps réel** (dérivé, non stocké) : plan d'eau (`computeBrewWaterPlan` avec le grist du snapshot + profil), volumes (empâtage/rinçage/total/pré-ébullition), et **liste des réservations de stock** prévues (ingrédients catalogués) + avertissements stock insuffisant (indicatifs, non bloquants).
- Création : `POST /api/batches` → redirection vers `/batches/:id` (détail, M3-09), affichage du `batchNumber`.
- L'écran n'est proposé que pour une recette **PUBLISHED** (un DRAFT ne peut pas être planifié).
- Wording : les volumes et le stock affiché sont un **aperçu** d'aide à la décision.

## Definition of Done
- [ ] Tests composants : aperçu du plan d'eau calculé depuis un profil, liste des réservations prévues, création (POST) + redirection vers le détail avec numéro de batch
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] **Critère fonctionnel observable (démo M3)** : depuis une recette publiée, choisir un équipement, voir l'aperçu volumes + stock réservé, créer le batch → détail avec numéro, stock passé en réservé

## Dépendances
Bloqué par : {{M3-01}}, {{M3-04}}, {{M3-05}}, {{M3-07}} — Bloque : —
