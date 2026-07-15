---
labels: core, feature, P0
milestone: M5 — Stocks complets
---
# M5-01 — core : schémas Zod stock + helpers purs (niveau dérivé, mise à l'échelle réel, seuil)

## Contexte
Le milestone M5 « Stocks complets » rend vivant le modèle stock déjà posé en {{M1-01}} : `CatalogItem` (kind `RECETTE`/`BULK`/`CONDITIONNEMENT`, `defaultUnitCostCents`, `reorderThreshold`), `StockLot`, `StockMovement` (**registre append-only**, trigger déjà en base), `StockReservation` (`RESERVED`/`CONSUMED`/`RELEASED`). Aucune logique n'est encore branchée dessus. Avant les routes API (M5-03+), il faut les **schémas Zod partagés** (ADR-04 : Zod vit dans `core`, valeurs d'enum **recopiées**, pas d'import DB) et les **calculs purs** réutilisés partout : niveau de stock dérivé du registre, ajustement d'une réservation au **volume réel** (§Stock « déduction effective basée sur volume réel »), et évaluation du **seuil de réappro différenciée par `kind`** (§3.3 « Alertes de seuil différenciées par kind »). SOURCE MÉTIER : `SPEC-FONCTIONNELLE.md` §Stock (Recette vs Bulk) ; `SPEC-ORCHESTRATION.md` §3.3.

## Objectif
`@brasso/core` expose un module `stock/` (helpers purs) et `schemas/stock.ts` (Zod) consommables par l'API M5, sans dépendance DB/UI (ADR-03).

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/stock/index.ts` (nouveau), `packages/core/src/schemas/stock.ts` (nouveau), exports `schemas/index.ts` + index racine `core`, tests `packages/core/tests/`.
- Hors périmètre explicite : coût de revient ({{M5-02}}), persistance/routes (M5-03+), UI (M5-07/08). Ne pas dupliquer `catalogKindSchema`/`ingredientCategorySchema` déjà exportés (les réutiliser).

## Spécification
- **Helpers purs** (déterministes, unités internes g/L/UNIT, centimes) :
  - `deriveStockLevel(movements: { delta: number }[]): number` — somme signée des `delta` (le niveau courant se **dérive** du registre append-only, schéma M1). Tableau vide → `0`.
  - `scaleQuantityToVolume(plannedQty, plannedVolumeL, actualVolumeL): number` — ajustement **proportionnel** : `plannedQty × actualVolumeL / plannedVolumeL`. `actualVolumeL` nul/`undefined` → renvoie `plannedQty` (pas d'ajustement). `RangeError` si `plannedVolumeL ≤ 0` ou entrées non finies / négatives.
  - `evaluateReorder(input): { available: number; below: boolean }` — seuil différencié par `kind` :
    - `RECETTE` : `available = level − reservedOutstanding` (réservations `RESERVED` non encore consommées), `below = threshold != null && available ≤ threshold`.
    - `BULK` / `CONDITIONNEMENT` : `available = level` (pas de réservation), `below = threshold != null && level ≤ threshold`.
    - `threshold == null` → `below = false` (pas d'alerte configurée).
- **Schémas Zod** (`schemas/stock.ts`, valeurs d'enum recopiées de Prisma) :
  - `catalogItemCreateSchema` : `name` (non vide), `kind` (`catalogKindSchema`), `category?` (`ingredientCategorySchema`, cohérent RECETTE), `unit` (`GRAM`|`LITER`|`UNIT`), `attributes?` (JSON libre), `defaultUnitCostCents?` (int ≥ 0), `reorderThreshold?` (≥ 0), `isActive?` (défaut `true`).
  - `catalogItemUpdateSchema` : `catalogItemCreateSchema.partial()` (au moins un champ).
  - `stockMovementInputSchema` : `catalogItemId`, `delta` (fini, ≠ 0), `reason` (**sous-ensemble manuel** : `PURCHASE`|`ADJUSTMENT`|`INVENTORY`|`LOSS`|`RETURN`|`OTHER` — **`PRODUCTION` et `SALE` exclus** de la saisie manuelle, réservés respectivement à la déduction batch {{M5-05}} et au hub caisse M7), `stockLotId?`, `note?`.
  - `inventoryCountSchema` : `{ catalogItemId, countedQuantity (≥ 0), note? }` — le delta d'ajustement (`countedQuantity − niveau courant`) est calculé côté service (M5-04), pas ici.
- Types inférés exportés (`CatalogItemInput`, `StockMovementInput`, `InventoryCount`, `ReorderInput`) réutilisables par l'API.

## Definition of Done
- [ ] Tests : `deriveStockLevel` (deltas signés, vide→0) ; `scaleQuantityToVolume` (proportion, `actualVolume` absent→identité, `RangeError` sur volume ≤ 0) ; `evaluateReorder` (RECETTE tient compte des réservations, BULK non, seuil `null`→pas d'alerte) ; `stockMovementInputSchema` rejette `PRODUCTION`/`SALE` et `delta = 0` ; `inventoryCountSchema` rejette `countedQuantity < 0`
- [ ] Couverture `core` ≥ 90 % maintenue
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : l'API M5 peut valider une saisie de mouvement/inventaire et dériver un niveau + une alerte de seuil à partir de `@brasso/core` seul

## Dépendances
Bloqué par : {{M1-01}} — Bloque : {{M5-03}}, {{M5-04}}, {{M5-05}}, {{M5-06}}
