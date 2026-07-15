---
labels: feature, P0
milestone: M5 — Stocks complets
epic: true
---
# M5 — Stocks complets (epic)

## Contexte
Issue chapeau du milestone M5 (SPEC-ORCHESTRATION §4 ; §3.3 stock à deux logiques ; SPEC-FONCTIONNELLE §Stock). On rend vivant le modèle stock **déjà posé en M1** (`CatalogItem`/`StockLot`/`StockMovement` append-only/`StockReservation`, ressource RBAC `stocks`) — **aucun ticket db** n'est nécessaire, le schéma suffit. Deux logiques : **RECETTE** (réservation à la planification, M3-05 → **déduction effective à l'ensemencement au volume réel**, M5-05) et **BULK** (mouvements manuels/forfaitaires + inventaire périodique). Plus les **alertes de seuil** différenciées par `kind` et le **coût de revient par batch** (coûts de référence catalogue ; lot pondéré = V2). Découpage core→api→web, sans savoir implicite.

## Critère de démo
Un batch planifié (stock **réservé**, M3) est **ensemencé** → son stock d'ingrédients Recette est **décrémenté au volume réel** (une seule fois, idempotent), visible sur la fiche batch ; un **coût de revient** chiffré est calculé (total, €/L, répartition) ; un article passé sous son **seuil** apparaît en alerte ; un achat BULK et un **inventaire** périodique recalent le stock manuellement.

## Sous-tickets
{{CHECKLIST}}

## Dépendances
Bloqué par la validation de la démo M4 (Jour J : la clôture de l'ensemencement déclenche la déduction) et s'appuie sur les réservations M3-05. Bloque M7 (le hub caisse décrémentera le stock conditionné via des mouvements `SALE` sur la même mécanique de registre).
