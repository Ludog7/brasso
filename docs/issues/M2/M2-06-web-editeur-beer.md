---
labels: web, feature, P0
milestone: M2 — Recettes
---
# M2-06 — web : éditeur BEER — calculs temps réel + jauges BJCP

## Contexte
Spec fonctionnelle : « BEER_ENGINE : affichage en temps réel DI/DF/ABV/IBU/EBC + jauges BJCP ». Les calculs viennent exclusivement de `@brasso/core` (`computeBeer`, `gaugeStatus`, `ebcToHex`) — jamais de formule réécrite côté front (règle FORMULES-BRASSICOLES.md).

## Objectif
Éditeur complet d'une recette BEER : détails, ingrédients, process — avec panneau de prévision recalculé localement à chaque frappe et jauges comparées au style BJCP choisi.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/recipes/beer/*` (branché dans le shell M2-05).
- Hors périmètre explicite : moteurs ALT/SOFT (M2-07/08), publication (M2-09), BeerXML (M2-12).

## Spécification
- Détails BEER : style BJCP (picker alimenté par M2-04), volume cible, durée d'ébullition, efficacité (fraction).
- Ingrédients (picker catalogue M2-04 + quantités en unités internes) : malts/céréales, sucres, houblons (forme, usage, temps d'ajout, alpha affiché), levure ; adjuvants libres.
- Process : paliers d'empâtage (température/durée), plan d'ébullition, plan de fermentation — persistés via `PUT /api/recipes/:id/steps` (M2-02).
- Panneau temps réel : `computeBeer` de `@brasso/core` exécuté côté client à chaque modification (debounce léger) → OG, FG, ABV, IBU (Tinseth), EBC + pastille couleur `ebcToHex`.
- Jauges BJCP : pour chaque métrique, jauge min/max du style sélectionné avec statut `below | in_range | above` (`gaugeStatus`) ; sans style sélectionné, valeurs affichées sans jauge.
- Aucune valeur calculée n'est saisie ni stockée comme vérité : la sauvegarde persiste les intrants, les cibles affichées restent dérivées.

## Definition of Done
- [ ] Tests composants : le panneau reflète `computeBeer` (valeurs de référence de FORMULES-BRASSICOLES.md sur un cas), jauges correctes vs style
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : modifier une quantité de malt fait bouger OG/ABV/EBC en direct, jauges à jour

## Dépendances
Bloqué par : {{M2-02}}, {{M2-04}}, {{M2-05}} — Bloque : —
