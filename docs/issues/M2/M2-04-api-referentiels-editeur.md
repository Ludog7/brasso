---
labels: api, feature, P0
milestone: M2 — Recettes
---
# M2-04 — api : référentiels éditeur — styles BJCP & catalogue ingrédients (lecture)

## Contexte
L'éditeur de recettes (M2-06/07/08) a besoin de pickers alimentés par le seed M1-02 : styles BJCP (plages OG/FG/IBU/EBC pour les jauges) et catalogue d'ingrédients `CatalogItem` de kind `RECETTE` (malts avec couleur/rendement, houblons avec alpha, levures, sucres, adjuvants).

## Objectif
Deux endpoints read-only performants qui alimentent les pickers de l'éditeur, RBAC déclaré explicitement (deny-by-default).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/bjcp/` et `apps/api/src/modules/catalog/` (ou un module `referentials` unique), `apps/api/tests/`.
- Hors périmètre explicite : écriture du catalogue (gestion stock = M5), taxonomie interne des boissons alternatives.

## Spécification
- `GET /api/bjcp-styles?search=` — recherche par code (`21A`) ou nom, retourne les plages cibles (OG/FG/IBU/EBC/ABV) en unités internes.
- `GET /api/catalog-items?kind=RECETTE&category=&search=` — filtre par catégorie (malt/sucre/houblon/levure/adjuvant), recherche par nom, pagination simple (`limit`/`offset`, limit ≤ 100).
- Champs techniques exposés dans les unités internes (`core/units.ts`) : couleur EBC, alpha en fraction, rendements en fraction.
- RBAC : (recipes, read) pour les styles BJCP ; (stock, read) pour le catalogue — cohérent matrice §3.5 (brasseur et caisse ont R sur stocks).
- Réponses typées par schémas Zod (réutiliser `@brasso/core` où disponible).

## Definition of Done
- [ ] Tests d'intégration : recherche BJCP par code et nom, filtres catalogue, pagination, RBAC
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : `GET /api/bjcp-styles?search=21A` retourne les plages du style seedé

## Dépendances
Bloqué par : {{M1-02}}, {{M0-05}} — Bloque : {{M2-06}}
