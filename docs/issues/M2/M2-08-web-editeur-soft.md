---
labels: web, feature, P0
milestone: M2 — Recettes
---
# M2-08 — web : éditeur SOFT_DRINK — sucre, pH, conservation (ADR-11)

## Contexte
Spec fonctionnelle (SOFT_DRINK_ENGINE) : pas d'ABV ni d'IBU ; variables clés = concentration en sucre, pH, aromatique ; suivi du mode de conservation (froid/ambiant) avec stabilisation si nécessaire. Wording ADR-11 identique à M2-07.

## Objectif
Éditeur d'une recette SOFT_DRINK (limonades, boissons sucrées non fermentées) branché dans le shell M2-05, indicateurs issus de `computeSoftDrink`.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/recipes/soft/*`.
- Hors périmètre explicite : moteurs BEER/ALT, publication (M2-09).

## Spécification
- Détails SOFT : `sugarConcentration` (g/L), `targetPh`, `storageMode` (froid / ambiant), notes aromatiques.
- ABV/IBU/EBC absents de l'écran ; pas de plan de houblonnage ni de fermentation — process réduit à chauffe/macération, `stabilize`, conditionnement (M2-02).
- Panneau temps réel via `computeSoftDrink` (`@brasso/core`) : indicateur pH (seuil 4.6), rappel de stabilisation si `storageMode = ambiant` et pH au-dessus du seuil.
- Wording ADR-11 : « indicateur d'aide à la décision », disclaimer `FOOD_SAFETY_DISCLAIMER` permanent.

## Definition of Done
- [ ] Tests composants : indicateurs cohérents avec le core, champs alcool absents du DOM, disclaimer présent
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une limonade `ambiant` à pH 4.8 affiche l'indicateur et le rappel de stabilisation

## Dépendances
Bloqué par : {{M2-02}}, {{M2-05}} — Bloque : —
