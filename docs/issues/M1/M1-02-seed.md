---
labels: db, feature, P1
milestone: M1 — Modèle & core
---
# M1-02 — Seed : catalogue ingrédients, styles BJCP, rôles, settings

## Contexte
SPEC-ORCHESTRATION §2 (`packages/db/seed/`) et critère de démo M1. Un jeu de données minimal réaliste permet aux modules recettes/batchs de fonctionner et aux tests d'intégration de s'appuyer sur des références.

## Objectif
`pnpm --filter @brasso/db db:seed` peuple une base fraîche avec ingrédients, styles BJCP, rôles RBAC et settings de base ; idempotent.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/db/seed/` (script + fichiers de données), script `db:seed`.
- Hors périmètre explicite : données de production, membres réels.

## Spécification
- **Catalogue ingrédients** (`CatalogItem`) : malts/céréales (avec `potentialSg`, couleur EBC, pouvoir diastatique), sucres, houblons (acides alpha, forme), levures/ferments (atténuation, plage T°, tolérance alcool), adjuvants, conditionnements (bouteilles, capsules, fûts, étiquettes), bulk (CO₂, nettoyants). Valeurs réalistes cohérentes avec FORMULES-BRASSICOLES.md (ex. Pale ≈ 37 points/kg/L).
- **Styles BJCP** : jeu représentatif avec plages OG/FG/IBU/EBC pour l'alignement des jauges (moteur BEER).
- **Rôles** : `admin`, `brasseur`, `caisse`, `rgpd` (+ association d'un compte admin de dev depuis env).
- **Settings** : `assoName`, TVA, profil d'eau par défaut, timezone.
- Seed **idempotent** (upsert par clé naturelle).

## Definition of Done
- [ ] `db:seed` peuple une base fraîche sans erreur, réexécutable (idempotent)
- [ ] Ingrédients cohérents avec les potentiels/couleurs de FORMULES-BRASSICOLES.md
- [ ] 4 rôles + settings présents
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : requêtes de comptage sur `CatalogItem`, `Role`, styles retournent des données

## Dépendances
Bloqué par : {{M1-01}} — Bloque : —
