---
labels: web, feature, P0
milestone: M5 — Stocks complets
---
# M5-07 — web : écran Stock (catalogue, niveaux, alertes, mouvements, inventaire)

## Contexte
La couche API stock est livrée ({{M5-03}} catalogue/niveaux, {{M5-04}} mouvements/inventaire, {{M5-06}} alertes). Il manque la **surface de gestion** pour les brasseurs : voir les articles et leur niveau courant, repérer les seuils franchis, saisir un achat / un forfait BULK, et faire un inventaire périodique. UI atelier (§6) : cibles ≥ 48 px, contraste AA, mode sombre, **zéro drag-and-drop**. RBAC (§3.5) : brasseur = CRUD, **caisse = lecture seule**.

## Objectif
Un écran `/stock` liste le catalogue avec niveau + badge d'alerte de seuil, permet le CRUD article, la saisie de mouvements et l'inventaire — les actions d'écriture étant masquées pour un rôle en lecture seule.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/stock/` (nouveau : `hooks.ts`, `StockList.tsx`, `ItemFormDialog.tsx`, `MovementDialog.tsx`, `InventoryPanel.tsx`, `AlertBadge.tsx`, `labels.ts`), route `/stock` dans `App.tsx` + entrée de navigation, `apps/web/src/lib/api.ts` (client `stockApi`), tests `apps/web/test/`.
- Réutilise le pattern éprouvé : `features/<domaine>/hooks.ts` (TanStack Query), `ui/` shadcn, `lib/api.ts`. RBAC UI : masquer les actions selon les droits de l'utilisateur courant (comme l'accès conditionnel des autres écrans).
- Hors périmètre explicite : coût de revient sur la fiche batch ({{M5-08}}), déduction à l'ensemencement (API {{M5-05}}).

## Spécification
- **Liste** (`GET /stock/items`) : onglets/filtre par `kind` (RECETTE / BULK / CONDITIONNEMENT), colonnes nom, unité, **niveau** (`level`), réservé (`reservedOutstanding` pour RECETTE), disponible, coût de référence. Ligne sous seuil → `AlertBadge` (« Stock bas ») ; wording différencié RECETTE (disponible net des réservations) vs BULK/CONDITIONNEMENT.
- **CRUD article** (`POST`/`PATCH /stock/items`) : `ItemFormDialog` (nom, kind — **non modifiable en édition**, catégorie si RECETTE, unité, coût de référence en €, seuil de réappro, actif). Saisie coût en euros → conversion en **centimes** avant envoi (unités internes, `core/units` côté valeurs métier — ici simple ×100 d'affichage).
- **Mouvement** (`POST /stock/movements`) : `MovementDialog` (article, type = achat/ajustement/perte/forfait…, quantité, sens, note). Reasons `PRODUCTION`/`SALE` **absents** du menu (réservés). Après succès : invalider la liste (niveau à jour) + toast.
- **Inventaire** (`POST /stock/inventory`) : `InventoryPanel` — saisir la quantité **comptée** par article, afficher l'écart (compté − niveau) avant envoi ; à la validation, la liste se rafraîchit.
- Accessibilité : dialogues `role="dialog"` avec libellés, boutons ≥ 48 px, focus géré.

## Definition of Done
- [ ] Tests web : liste avec niveau + badge de seuil ; création/édition d'article (kind verrouillé en édition, coût € → centimes) ; saisie mouvement invalide la liste ; inventaire affiche l'écart et rafraîchit ; **actions d'écriture masquées en rôle lecture seule**
- [ ] Lint + CI verte ; **tous** les fichiers formatés (Prettier — piège CRLF connu)
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : depuis `/stock`, voir les niveaux, être alerté sur un article sous seuil, saisir un achat et un inventaire qui recalent le stock

## Dépendances
Bloqué par : {{M5-03}}, {{M5-04}}, {{M5-06}} — Bloque : —
