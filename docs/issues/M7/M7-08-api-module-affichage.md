---
labels: api, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-08 — api : module d'affichage (CRUD surfaces/écrans + rendu synchronisé au stock)

## Contexte
Le **module d'affichage en brasserie** (§Module d'affichage) gère des **surfaces** (Bar, Salle, Événement), des **écrans** (templates liste/tableau/cartes, mentions légales) et une **sélection de produits** avec indicateurs, **synchronisée au stock** (« mise à jour automatique à chaque changement significatif de stock ou de statut produit »). Le schéma vient de {{M7-02}} ; la **sélection/rendu pur** (`selectDisplayItems`, filtre stock > 0, flags) vient de {{M7-01}}. La matrice §3.5 : ressource `affichage` = `admin` CRUD, `brasseur`/`caisse` RU. SOURCE : `SPEC-ORCHESTRATION.md` §3.5 (ressource `affichage`) ; `SPEC-FONCTIONNELLE.md` §Module d'affichage (surfaces, templates, sélection, sync, mentions).

## Objectif
Un `admin` configure surfaces, écrans et produits affichés ; l'API sert un **rendu d'écran** ne listant que les produits disponibles (stock > 0) avec leurs indicateurs et mentions légales, prêt pour l'affichage temps réel.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/display/{routes,service,repository,schema}.ts` (nouveau module ; `schema` importe les schémas d'affichage de {{M7-01}}), consomme `selectDisplayItems` ({{M7-01}}) et le niveau de stock dérivé (M5), câblage `app.ts`, tests `apps/api/test/`.
- Hors périmètre explicite : UI de configuration ({{M7-12}}) et vue d'affichage ({{M7-13}}) ; mécanisme de push temps réel (le front pollera / re-fetchera — la sync « significative » est côté rendu, pas un WebSocket V1).

## Spécification
- **CRUD configuration** (RBAC ressource `affichage`) :
  - Surfaces : `GET/POST /display/surfaces`, `PATCH/DELETE /display/surfaces/:id` (`create`/`read`/`update`/`delete` selon rôle — `admin` CRUD ; `brasseur`/`caisse` `read`+`update`).
  - Écrans : `GET/POST /display/surfaces/:surfaceId/screens`, `PATCH/DELETE /display/screens/:id` — `template` (`LIST`/`TABLE`/`CARDS`), `legalMentions` (texte libre), `isActive`.
  - Produits d'un écran : `PUT /display/screens/:id/items` — remplace la sélection (`[{ catalogItemId, isNew, isFavorite, isSpecial, priceCents?, sortOrder }]`), validé par les schémas de {{M7-01}} ; `catalogItemId` doit exister.
- **Rendu d'écran** `GET /display/screens/:id/render` (RBAC `affichage`, `read`) :
  - Charge les items de l'écran, calcule le **niveau de stock courant** par `catalogItemId` (dérivé des `StockMovement`, M5), applique `selectDisplayItems(items, stockByItem, now)` → **n'inclut que les produits disponibles** (stock > 0), avec flags, prix affiché, triés par `sortOrder`.
  - Renvoie aussi `template`, `legalMentions`, `surface`, et un **horodatage/hash de synchronisation** permettant au front de détecter un changement significatif (base de la sync {{M7-13}}).
- **Mentions légales** : `legalMentions` est du **texte libre** défini par l'écran (messages alcool/allergènes) — l'API ne code aucun message en dur (ADR-01) ; le rendu le renvoie tel quel pour affichage permanent.
- **RBAC** : `admin` CRUD complet ; `brasseur`/`caisse` peuvent lire et **mettre à jour** (RU) mais pas créer/supprimer surfaces/écrans ; `rgpd` aucun accès.

## Definition of Done
- [ ] Tests d'intégration : CRUD surfaces/écrans/items ; `PUT items` remplace la sélection (validation `catalogItemId`) ; `render` n'inclut **que** les produits stock > 0, expose flags/prix/mentions/template + jeton de sync ; un produit tombé à 0 disparaît du rendu ; RBAC (`admin` CRUD ; `brasseur`/`caisse` RU ; `rgpd` refusé)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : configurer une surface « Bar » + un écran, y placer des produits, et obtenir un rendu qui masque automatiquement les produits en rupture

## Dépendances
Bloqué par : {{M7-01}}, {{M7-02}} — Bloque : {{M7-12}}, {{M7-13}}
