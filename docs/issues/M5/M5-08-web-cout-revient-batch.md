---
labels: web, feature, P0
milestone: M5 — Stocks complets
---
# M5-08 — web : coût de revient + déduction de stock sur la fiche batch

## Contexte
Second volet du critère de démo M5, côté UI : rendre **visible** que « le batch ensemencé a décrémenté le stock » et afficher le **coût de revient calculé**. L'API est prête : `GET /batches/:id/cost` ({{M5-06}}) et les mouvements `PRODUCTION` / réservations `CONSUMED` produits à l'ensemencement ({{M5-05}}). Wording : le coût est une **estimation** (coûts de référence catalogue), à afficher comme tel (cohérent avec la discipline de wording du projet — jamais « exact/garanti »).

## Objectif
La fiche batch (`/batches/:id`) affiche un panneau « Coût de revient » chiffré (total, €/L, répartition) et rend lisible la déduction de stock du batch (réservations consommées / mouvements de production).

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/batches/` (nouveau `CostPanel.tsx`, `StockDeductionPanel.tsx`, hooks dans `hooks.ts`), montage dans la page détail batch (`routes/`), `apps/web/src/lib/api.ts` (`batchApi.cost` + type `BatchCost`), tests `apps/web/test/`.
- Réutilise le type `BatchCost` (sortie `computeBatchCost`, {{M5-02}}) et le pattern hooks TanStack Query existant des batches.
- Hors périmètre explicite : écran de gestion du stock ({{M5-07}}), calcul du coût (API {{M5-06}}).

## Spécification
- **`CostPanel`** (`GET /batches/:id/cost`) : total en €, **coût au litre** (€/L), et répartition ingrédients / conditionnement / bulk (barres ou lignes). Affiche `basis` (« estimation planifiée » avant ensemencement / « depuis consommation réelle » après). `missingCostLines > 0` → note « N ingrédient(s) sans coût de référence — total sous-estimé ». Montants formatés depuis les **centimes** (÷100, `Intl` fr-FR).
- **`StockDeductionPanel`** : liste les réservations du batch et leur statut (`RESERVED` planifié / `CONSUMED` déduit) + les mouvements `PRODUCTION` (quantité décrémentée, article). Avant ensemencement → « stock réservé, pas encore déduit » ; après → quantités effectivement déduites au **volume réel**. Rend le critère de démo directement observable à l'écran.
- **Disclaimer** coût : mention brève « estimation basée sur les coûts de référence du catalogue ».
- Accessibilité/atelier : lisible en mode sombre, pas d'action destructive ici (lecture).

## Definition of Done
- [ ] Tests web : `CostPanel` affiche total/€ au litre/répartition depuis un `BatchCost` stubé, note `missingCostLines`, bascule de libellé `basis` planifié/consommé ; `StockDeductionPanel` distingue réservé vs consommé ; wording « estimation » présent, pas de « exact/garanti »
- [ ] Lint + CI verte ; **tous** les fichiers formatés (Prettier — piège CRLF connu)
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable (**démo M5**) : sur la fiche d'un batch ensemencé, voir le stock déduit au volume réel **et** le coût de revient chiffré

## Dépendances
Bloqué par : {{M5-05}}, {{M5-06}} — Bloque : —
