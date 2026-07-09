---
labels: api, feature, P0
milestone: M3 — Équipements & batchs
---
# M3-03 — api : CRUD des profils d'équipement

## Contexte
Un batch référence un **profil d'équipement** (cuve : volume nominal, deadspace, pertes, évaporation, calorique, profils d'eau). Le modèle Prisma `EquipmentProfile` existe déjà (schéma M1). M3 expose son CRUD via l'API pour alimenter la planification (M3-04/M3-08). SPEC-FONCTIONNELLE « Équipement ».

## Objectif
`apps/api` expose `/api/equipment-profiles` (CRUD) validé par des schémas Zod partagés `@brasso/core`, avec activation/désactivation (soft state via `isActive`).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/equipment/*` (nouveau : schema/repository/service/routes), branchement dans `app.ts`, `apps/api/tests/`.
- Schémas Zod partagés : `packages/core/src/schemas/equipment.ts` (nouveau) — champs alignés sur `EquipmentProfile` + `waterProfiles` (M3-02).
- Hors périmètre explicite : calcul du plan d'eau (M3-01), batchs (M3-04), UI (M3-07).

## Spécification
- Routes : `GET /api/equipment-profiles?active=` (liste), `GET /api/equipment-profiles/:id`, `POST` (création), `PATCH /:id` (maj partielle), `POST /:id/deactivate` (bascule `isActive=false`, réactivation via `PATCH`). Suppression **interdite** si des batchs y référent (Prisma `onDelete: SetNull` conserve l'historique) → privilégier la désactivation.
- Validation : `nominalVolumeL` > 0 ; pertes/taux ≥ 0 ; `waterProfiles` validé par le schéma M3-02 ; unités internes (L, kW, kJ/°C).
- **RBAC** : ressource `recettes` (domaine brassage, matrice §3.5 figée ADR-10) — brasseur/admin CRUD, caisse lecture seule. Toute nouvelle ressource RBAC = ticket `type:adr`.
- Repository injectable (Prisma / in-memory) — même pattern que `recipes` (M2-01).

## Definition of Done
- [ ] Tests d'intégration : CRUD complet, validation (volume ≤ 0 → 400), RBAC (caisse lecture, création refusée), désactivation
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : créer un profil d'équipement, le relire, le désactiver ; il n'apparaît plus dans la liste `active=true`

## Dépendances
Bloqué par : {{M1-01}}, {{M3-02}} — Bloque : {{M3-04}}, {{M3-07}}
