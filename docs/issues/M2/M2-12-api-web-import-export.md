---
labels: api, web, feature, P1
milestone: M2 — Recettes
---
# M2-12 — api + web : import/export de recettes (routes + UI)

## Contexte
Brancher les convertisseurs core (BeerXML M2-10, JSON propriétaire M2-11) sur l'API et l'UI : import → nouveau DRAFT, export selon le moteur. Clôture du périmètre M2 (SPEC-ORCHESTRATION §4).

## Objectif
Depuis l'UI : exporter une recette (fichier téléchargé au bon format selon son moteur) et importer un fichier (BeerXML ou JSON propriétaire) qui devient un DRAFT éditable.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/recipes/` (extension), `apps/web/src/features/recipes/*`, tests des deux apps.
- Hors périmètre explicite : partage entre instances distantes (V2), BeerJSON.

## Spécification
- `GET /api/recipes/:id/export` : BEER → `application/xml` (BeerXML, M2-10) ; ALT/SOFT → `application/json` (brasso-recipe v1, M2-11) ; en-tête `Content-Disposition` avec nom de fichier propre.
- `POST /api/recipes/import` : corps brut XML ou JSON ; détection du format, parse via core, création d'un `DRAFT` version 1 (nouvelle `familyId`) via le service M2-01/M2-02 ; erreurs de parse/validation → 422 avec messages exploitables (chemins des champs en cause).
- RBAC : (recipes, read) pour l'export, (recipes, create) pour l'import.
- UI : bouton « Exporter » sur la page détail (M2-09) → téléchargement ; « Importer » sur la liste (M2-05) → sélection de fichier, restitution claire des erreurs 422, redirection vers l'éditeur du DRAFT créé.
- Limite de taille de fichier raisonnable (ex. 1 Mo) → 413.

## Definition of Done
- [ ] Tests d'intégration API : export des 3 moteurs (bons content-types), import BeerXML et JSON OK, fichier invalide → 422, RBAC
- [ ] Tests composants : parcours import avec erreur affichée puis import réussi
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : exporter une BEER publiée, la réimporter → nouveau DRAFT dont les prévisions core sont identiques

## Dépendances
Bloqué par : {{M2-03}}, {{M2-10}}, {{M2-11}} — Bloque : —
