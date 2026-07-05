---
labels: api, feature, P0
milestone: M2 — Recettes
---
# M2-03 — api : versioning & publication des recettes (ADR-06/07)

## Contexte
ADR-07 : une recette `PUBLISHED` est **immuable** ; l'éditer crée un `DRAFT` version n+1 dans la même famille (`familyId`, `(familyId, version)` unique). La contrainte moteur ALT (`stabilizationMethod` non-null pour publier) est une règle `core` (SPEC-ORCHESTRATION §3.1) déjà portée par les `PublicationCheck` des moteurs (M1-12).

## Objectif
Cycle de vie complet côté API : publier un DRAFT (validation moteur), créer une nouvelle version depuis une PUBLISHED, archiver — immuabilité garantie par le serveur.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/recipes/` (extension), `apps/api/tests/`.
- Hors périmètre explicite : UI de publication (M2-09), snapshot batch (M3).

## Spécification
- `POST /api/recipes/:id/publish` : exécute la validation de publication du moteur via `@brasso/core` (`PublicationCheck` — dont `stabilizationMethod` obligatoire pour ALT) ; si échec → 422 avec la liste des manquements ; si succès → `DRAFT → PUBLISHED`.
- `POST /api/recipes/:id/new-version` : uniquement depuis une `PUBLISHED` ; copie profonde (commun + détail moteur + ingrédients + steps) en `DRAFT` version n+1, même `familyId` ; 409 s'il existe déjà un `DRAFT` dans la famille.
- `POST /api/recipes/:id/archive` : `PUBLISHED → ARCHIVED` (les ARCHIVED restent lisibles, jamais modifiables).
- Immuabilité serveur : tout PATCH/PUT/DELETE sur `PUBLISHED`/`ARCHIVED` → 409 (verrou déjà posé en M2-01/M2-02, ajouter les tests de non-contournement via les nouvelles routes).
- Transitions de statut strictes : `DRAFT → PUBLISHED → ARCHIVED`, aucune autre.

## Definition of Done
- [ ] Tests d'intégration : publication OK/KO (ALT sans stabilisation → 422), new-version (copie profonde vérifiée), unicité du DRAFT par famille, immuabilité
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : publier v1, créer v2 DRAFT, modifier v2, republier — v1 intacte

## Dépendances
Bloqué par : {{M2-01}}, {{M2-02}} — Bloque : {{M2-09}}, {{M2-12}}
