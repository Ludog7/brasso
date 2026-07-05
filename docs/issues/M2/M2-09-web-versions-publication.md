---
labels: web, feature, P0
milestone: M2 — Recettes
---
# M2-09 — web : versions & publication — parcours UI

## Contexte
ADR-07 côté interface : publier un DRAFT, consulter l'historique d'une famille de versions, créer la version n+1 depuis une PUBLISHED. C'est le parcours du critère de démo M2 (« créer, publier, versionner une recette de chaque type »).

## Objectif
Depuis l'UI : publier (avec restitution des manquements), naviguer entre versions, créer une nouvelle version, archiver — les recettes non-DRAFT sont visuellement et fonctionnellement en lecture seule.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/recipes/*` (page détail + éléments du shell M2-05).
- Hors périmètre explicite : import/export (M2-12), écrans batch (M3).

## Spécification
- Page détail `/recipes/:id` : lecture complète (détails, ingrédients, process, prévisions calculées localement), badges statut + version, sélecteur de versions de la famille (`familyId`).
- « Publier » (sur DRAFT) : appelle `POST /publish` ; en cas de 422, affiche la liste des manquements du `PublicationCheck` (ex. stabilisation manquante pour ALT) près des champs concernés.
- « Nouvelle version » (sur PUBLISHED) : confirmation → `POST /new-version` → redirection vers l'éditeur du nouveau DRAFT ; bandeau « v(n) publiée reste inchangée ».
- « Archiver » (sur PUBLISHED) : confirmation → badge ARCHIVED.
- Lecture seule stricte des PUBLISHED/ARCHIVED : formulaires désactivés, aucune mutation proposée hormis new-version/archive.
- UI atelier §6 (touch ≥ 48 px, AA, sombre, pas de drag-and-drop).

## Definition of Done
- [ ] Tests composants : publication OK/KO avec restitution 422, navigation de versions, lecture seule effective
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : dérouler créer → publier → nouvelle version → republier sur une recette de chaque moteur (démo M2)

## Dépendances
Bloqué par : {{M2-03}}, {{M2-05}} — Bloque : —
