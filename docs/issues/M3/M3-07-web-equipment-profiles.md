---
labels: web, feature, P1
milestone: M3 — Équipements & batchs
---
# M3-07 — web : gestion des profils d'équipement

## Contexte
Les profils d'équipement (M3-03) doivent être gérables depuis l'UI pour alimenter la planification (M3-08). SPEC-FONCTIONNELLE « Équipement » : volume nominal, deadspace, pertes, évaporation, calorique, profils d'eau. Cible **tablette** (tactile, ≥ 48 px).

## Objectif
Un écran `/equipment` liste les profils d'équipement et permet d'en créer / éditer / désactiver un via un formulaire clair.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/routes/equipment/*`, `apps/web/src/features/equipment/*`, client `lib/api.ts` (`equipmentApi`), hooks TanStack Query, tests composants.
- Réutilise les primitives UI existantes (Card, Button, Select, Label, Input) et le pattern hooks de `features/recipes`.
- Hors périmètre explicite : édition avancée de la chimie de l'eau (profils cibles par style — champ JSON simple à ce stade), planification de batch (M3-08).

## Spécification
- Liste : nom, volume nominal, actif/inactif, action « Modifier ». Filtre actif/inactif.
- Formulaire : `nominalVolumeL`, `deadspaceL`, `transferLossL`, `evaporationRateLPerHour`, `grainAbsorptionLPerKg`, `heatingPowerKw?`, `thermalMassKjPerC?` ; l'analyse d'eau de base (ions M3-02) en champs numériques optionnels. Validation client alignée sur les schémas Zod partagés (volume > 0, taux ≥ 0). Garde de navigation « modifications non enregistrées » (pattern M2-05).
- Désactivation via `POST /:id/deactivate` ; un profil désactivé reste visible en filtre « inactifs » (historique batchs préservé).
- Wording et unités affichés clairement (L, %, kW) ; pas de dépendance UI lourde.

## Definition of Done
- [ ] Tests composants : rendu de la liste, création (POST) + retour liste, validation (volume ≤ 0 → message), désactivation
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : créer un profil d'équipement depuis l'UI, le voir apparaître dans la liste, puis le désactiver

## Dépendances
Bloqué par : {{M3-03}} — Bloque : —
