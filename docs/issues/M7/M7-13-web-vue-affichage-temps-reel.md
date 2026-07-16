---
labels: web, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-13 — web : vue d'affichage temps réel (rendu bar synchronisé au stock) — démo « écran bar à jour »

## Contexte
**Critère de démo M7** (volet affichage) : « écran bar à jour ». Cette vue **plein écran** rend un écran configuré ({{M7-12}}) via l'endpoint de rendu ({{M7-08}}) : n'affiche que les **produits disponibles** (stock > 0), avec indicateurs (`nouveau`/`coup de cœur`/`brassin spécial`), prix, et **mentions légales permanentes**. Elle se **resynchronise automatiquement** à chaque changement significatif de stock (« mise à jour automatique à chaque changement significatif de stock ou de statut produit »). Vente décrémentant le stock ({{M7-05}}) → produit qui tombe à 0 **disparaît de l'écran**. SOURCE : `SPEC-FONCTIONNELLE.md` §Module d'affichage (sync, mentions) ; `SPEC-ORCHESTRATION.md` §4 (démo M7) ; UI §6.

## Objectif
Une vue d'affichage plein écran montre les produits disponibles d'un écran, se met à jour automatiquement quand le stock change, et affiche en permanence les mentions légales.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/display/` (`DisplayRenderView.tsx`, `useDisplayRender.ts` — polling/re-fetch sur le jeton de sync, `templates/` : `ListTemplate.tsx`/`TableTemplate.tsx`/`CardsTemplate.tsx`, `LegalMentionsBar.tsx`), route **plein écran** `apps/web/src/routes/display/screen/:id` (layout sans nav), tests `apps/web/src/test/display-render.test.tsx`.
- Hors périmètre explicite : configuration ({{M7-12}}) ; calcul de disponibilité (fait par l'API {{M7-08}} via `selectDisplayItems`). Pas de WebSocket : re-fetch périodique + invalidation TanStack Query au changement de stock connu.

## Spécification
- **Rendu par template** : `DisplayRenderView` charge `GET /display/screens/:id/render` et rend selon `template` (`LIST`/`TABLE`/`CARDS`) : nom produit, prix affiché (formaté euros), badges d'indicateurs. Layout **atelier/vitrine** : gros texte, fort contraste, mode sombre, lisible à distance.
- **Sync automatique** : `useDisplayRender` re-fetch périodiquement (intervalle raisonnable, ex. 15–30 s) **et** s'invalide sur les mutations de stock connues du client ; il compare le **jeton/hash de sync** renvoyé par l'API pour ne re-rendre que sur changement significatif. Un produit passé à stock 0 **disparaît**, un produit réapprovisionné **réapparaît**.
- **Mentions légales** : `LegalMentionsBar` affiche `legalMentions` en **permanence** (bandeau), messages alcool/allergènes (texte porté par l'écran).
- **Robustesse** : erreur réseau transitoire → conserver le dernier rendu affiché (pas d'écran blanc en salle) ; indiquer discrètement l'état « hors ligne / resync ».
- **A11y/atelier** : cibles ≥ 48 px si interactif, contraste AA renforcé, mode sombre par défaut.

## Definition of Done
- [ ] Tests web (Vitest/RTL, faux `fetch` + timers) : rendu des 3 templates ; **seuls** les produits disponibles s'affichent ; re-fetch sur intervalle et re-rendu **au changement de jeton de sync** ; produit tombé à 0 disparaît ; mentions légales toujours visibles ; conservation du dernier rendu sur erreur réseau
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] **Critère de démo M7** observable : après une vente qui vide un produit, l'écran bar retire ce produit automatiquement ; les mentions légales restent affichées

## Dépendances
Bloqué par : {{M7-08}}, {{M7-12}} — Bloque : —
