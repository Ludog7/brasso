---
labels: web, feature, P0
milestone: M4 — Jour J
---
# M4-14 — web : file d'actions offline (IndexedDB) + resync + indicateur connexion

## Contexte
**Critère de démo M4** : dérouler un brassage complet sur tablette, **wifi coupé 10 min sans perte** (ADR-08). File d'actions locale (IndexedDB via `idb`) rejouée à la reconnexion, idempotente côté serveur (M4-06).

## Objectif
Mettre en file les événements Jour J quand hors-ligne dans IndexedDB, les rejouer via `POST /day/events:sync` (M4-06) à la reconnexion, avec indicateur d'état et résolution des rejets.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/day/offline/` (file `idb`, resync, hook), intégration des mutations Jour J (M4-09…M4-13) via cette file.
- Hors périmètre explicite : offline **complet** multi-écrans (V2, ADR-08).

## Spécification
- **File IndexedDB** (`idb`) : chaque entrée `{ clientEventId (uuid), batchId, event (avec `at` capté localement) }`. Les mutations Jour J passent par la file : en ligne → flush immédiat ; hors-ligne → conservé.
- **Resync** : sur `online` (et au montage), flush **ordonné par `at`** via `:sync` (idempotent grâce au `clientEventId`) ; succès → purge de la file ; rejet serveur → marquer l'entrée (affichage), **ne pas boucler**.
- **Indicateur** : bannière « Hors-ligne — N actions en attente » / « Synchronisé ». L'UI reste utilisable hors-ligne (**état optimiste local** dérivé de la machine core côté client, réconcilié à la synchro : **serveur = vérité**).
- **Horodatage** : `at` capté à l'action (client), conservé jusqu'à la synchro (déterminisme {{M1-13}} + ADR-08 : le serveur valide/borne à la réception).

## Definition of Done
- [ ] Tests : événement mis en file hors-ligne ; resync rejoue via `:sync` et purge la file ; rejeu idempotent ne double pas ; bannière compte les actions en attente
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : couper le réseau, dérouler 2 étapes, rétablir → l'état serveur reflète les 2 étapes **sans doublon**

## Dépendances
Bloqué par : {{M4-06}}, {{M4-09}} — Bloque : —
