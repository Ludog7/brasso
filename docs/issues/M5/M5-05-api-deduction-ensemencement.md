---
labels: api, feature, P0
milestone: M5 — Stocks complets
---
# M5-05 — api : déduction de stock à l'ensemencement (réservations → consommation au volume réel)

## Contexte
**Cœur du critère de démo M5** : « un batch ensemencé décrémente le stock ». §Stock (Articles Recette) : « À la validation de l'ensemencement : déduction effective basée sur **volume réel** du batch (ajustement). » Les réservations `RESERVED` sont posées à la planification ({{M3-05}}) pour le volume **planifié** ; il reste à les **consommer** quand le batch entre en `EN_FERMENTATION`, en ajustant les quantités au volume réellement obtenu. Deux chemins mènent à `EN_FERMENTATION` : la progression administrative `changeStatus` ({{M3-06}}, `repo.transition`) **et** la clôture du Jour J ({{M4-05}}, événement `finished` → `EN_FERMENTATION`). La déduction doit se déclencher quel que soit le chemin, sans jamais décrémenter deux fois.

## Objectif
À l'entrée en `EN_FERMENTATION`, les réservations `RESERVED` du batch sont consommées (statut `CONSUMED`) et matérialisées en mouvements `StockMovement` `PRODUCTION` négatifs, **ajustés au volume réel** — de façon **atomique et idempotente**.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/stock/{service,repository,routes}.ts` (service de consommation + endpoint dédié), câblage dans le flux `EN_FERMENTATION` de `apps/api/src/modules/batches/service.ts` (`changeStatus`) **et** de `apps/api/src/modules/batches/day.service.ts` (clôture, {{M4-05}}), `apps/api/tests/`.
- Réutilise `scaleQuantityToVolume` ({{M5-01}}) et `StockReservation`/`StockMovement` (schéma M1). **Ne pas** modifier le réducteur pur `transition` (M1-13, sanctuarisé) : la consommation est un **effet** appliqué dans la même transaction que le passage `EN_FERMENTATION`, pas une transition core.
- Hors périmètre explicite : BULK/inventaire ({{M5-04}}), coût de revient ({{M5-06}}), UI ({{M5-08}}). Le conditionnement (CONDITIONNEMENT) n'est pas déduit ici (hors ensemencement).

## Spécification
- Service `consumeReservationsForBatch(batchId, actorId)` (idempotent) :
  1. Charge les réservations `RESERVED` du batch. **Aucune** → no-op (`{ consumed: 0, alreadyDone: true }`) — garantit l'idempotence (2ᵉ appel, rejeu offline, double chemin).
  2. Détermine le **volume réel** : dernière mesure `VOLUME` du batch (`BatchMeasure`) ; à défaut, `recipeSnapshot` volume planifié (⇒ pas d'ajustement).
  3. Pour chaque réservation : `consumedQty = scaleQuantityToVolume(reservation.quantity, plannedVolumeL, actualVolumeL)`. Insère un `StockMovement` `{ catalogItemId, delta: −consumedQty, reason: PRODUCTION, batchId, userId: actorId }` et passe la réservation à `CONSUMED` (`quantity` consommée horodatée). **Le tout dans une seule transaction.**
- **Intégration** : appeler ce service dans la même transaction que l'entrée en `EN_FERMENTATION`, sur les **deux** chemins (`changeStatus` M3-06 et clôture Jour J M4-05). L'idempotence protège le cas où les deux se succèdent ou qu'un rejeu offline ({{M4-06}}) repasse la clôture.
- **Endpoint dédié** (démo + rattrapage) : `POST /batches/:id/stock/consume` (RBAC `stocks:update` ; caisse **403**) — déclenche/rejoue la consommation, idempotent. Réponse `{ consumed, movements[], alreadyDone }`. 404 batch absent ; 409 si batch pas encore ensemencé (`< EN_FERMENTATION`).
- Traçabilité : les réservations ne sont **jamais** supprimées (RESERVED→CONSUMED, comme RELEASED en annulation) ; les mouvements sont append-only.

## Definition of Done
- [ ] Tests d'intégration : entrée en `EN_FERMENTATION` (via `changeStatus`) crée des mouvements `PRODUCTION` négatifs et passe les réservations à `CONSUMED` ; **ajustement au volume réel** (mesure `VOLUME` < planifié → quantités réduites proportionnellement ; absence de mesure → quantités = planifié) ; **idempotence** (2ᵉ appel = no-op, pas de double décrément) ; clôture Jour J {{M4-05}} déclenche la même consommation ; endpoint `POST …/stock/consume` (RBAC caisse 403/anon 401, 409 si non ensemencé, 404 absent)
- [ ] Lint + CI verte ; **pas de régression** sur les tests batches/Jour J existants
- [ ] Critère fonctionnel observable : ensemencer un batch planifié décrémente effectivement le stock des ingrédients Recette au volume réel, une seule fois

## Dépendances
Bloqué par : {{M5-03}}, {{M3-05}}, {{M4-05}} — Bloque : {{M5-08}}
