---
labels: core, feature, P1
milestone: M5 — Stocks complets
---
# M5-02 — core : coût de revient d'un batch (`computeBatchCost`)

## Contexte
Le critère de démo M5 est double : « un batch ensemencé décrémente le stock **et** coût de revient calculé ». Le calcul du coût de revient est de l'**agrégation métier** — il n'existe **aucune formule dédiée** dans `FORMULES-BRASSICOLES.md` (ce n'est pas une formule brassicole). SPEC-FONCTIONNELLE §Stock « Coût de revient » : « Basé sur ingrédients Recette + conditionnement. Bulk imputé forfaitairement si nécessaire. » Décision de cadrage M5-00 (validée) : **base = coût de référence catalogue** (`defaultUnitCostCents`) ; le coût lot réel pondéré (FIFO/moyenne) est reporté en V2. Fonction pure, testée contre des valeurs de référence calculées à la main.

## Objectif
`@brasso/core` expose `computeBatchCost(input)` → coût de revient total et ramené au litre / à l'unité conditionnée, en centimes, déterministe et pur (ADR-03).

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/stock/cost.ts` (nouveau), export via `stock/index.ts` + index racine, tests `packages/core/tests/`.
- Hors périmètre explicite : accès aux coûts en base et résolution des quantités consommées (API {{M5-06}}), coût lot pondéré (V2), UI ({{M5-08}}).

## Spécification
- Entrée `computeBatchCost(input)` :
  ```
  {
    ingredients:  { quantity: number; unitCostCents: number | null }[]  // RECETTE consommés
    conditioning: { quantity: number; unitCostCents: number | null }[]  // CONDITIONNEMENT (bouteilles, capsules, fûts…)
    bulkForfaitCents?: number   // imputation forfaitaire bulk (défaut 0)
    batchVolumeL?: number       // pour le coût au litre
    packagedUnits?: number      // pour le coût à l'unité conditionnée
  }
  ```
- Sortie :
  ```
  {
    ingredientsCents: number
    conditioningCents: number
    bulkCents: number
    totalCents: number
    costPerLiterCents: number | null            // null si batchVolumeL absent/≤0
    costPerPackagedUnitCents: number | null     // null si packagedUnits absent/≤0
    missingCostLines: number                    // lignes à unitCostCents null (coût inconnu ⇒ comptées 0)
  }
  ```
- Règles : coût d'une ligne = `round(quantity × unitCostCents)` ; `unitCostCents = null` → ligne comptée **0** et incrémente `missingCostLines` (traçabilité de l'incomplétude, exploitée par l'UI). Tous les montants sont des **entiers de centimes** (`Math.round`). `costPerLiterCents = round(totalCents / batchVolumeL)`, `costPerPackagedUnitCents = round(totalCents / packagedUnits)`. `RangeError` sur `quantity`/`unitCostCents` négatifs ou non finis.

## Definition of Done
- [ ] Tests avec **valeurs de référence calculées à la main** : cas nominal (ingrédients + conditionnement + `batchVolumeL` → total, €/L et €/unité justes), imputation `bulkForfaitCents`, ligne à coût inconnu (`missingCostLines` incrémenté, comptée 0), `batchVolumeL`/`packagedUnits` absents → `null`, arrondis centimes, `RangeError` sur entrée négative
- [ ] Couverture `core` ≥ 90 % maintenue
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : à partir des quantités consommées et des coûts catalogue, `computeBatchCost` produit un coût de revient chiffré consommable par {{M5-06}} / {{M5-08}}

## Dépendances
Bloqué par : {{M1-01}} — Bloque : {{M5-06}}, {{M5-08}}
