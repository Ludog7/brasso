---
labels: feature, P0
milestone: M7 — Hub caisse & affichage
epic: true
---
# M7 — Hub caisse & affichage (epic)

## Contexte
Issue chapeau du milestone M7 (SPEC-ORCHESTRATION §4 ; §3.6 hub caisse ADR-09 ; §3.5 RBAC `transactions`/`mapping`/`affichage` ; SPEC-FONCTIONNELLE §Module Caisse & Comptabilité, §Module d'affichage). On rend vivant le hub caisse **déjà posé en schéma en M1** (`ExternalProvider`/`ExternalTransaction` append-only, `SkuMapping`, `IntegrationAlert` — avec `ExternalTransaction.externalProductId` et `StockMovement.externalTransactionId`/`reason=SALE` **déjà prêts**) et on **réutilise la fondation webhook de M6-07** (signature abstraite par provider, stratégies `SUMUP`/`ZETTLE` **déjà enregistrées**, idempotence, raw body, rate-limit). **Un seul changement de schéma** (M7-02) : le **module d'affichage** (surfaces/écrans/produits), absent du schéma M1. Découpage core→db→api→web, sans savoir implicite : d'abord le métier pur (M7-01 : décision de rapprochement mode-dégradé, CSV, rendu écran), puis l'API (webhooks SumUp/Zettle → rapprochement vente↔stock → anomalies → exports → affichage), puis le web (caisse, anomalies, exports, config écrans, vue temps réel).

## Critère de démo
Trois volets (§4) : **(1) vente SumUp → stock décrémenté** — une vente signée est ingérée (transaction externe `SALE` append-only, idempotente), rapprochée d'un produit via son mapping SKU, ce qui décrémente le stock du produit conditionné ; **(2) vente non mappée → alerte** — une vente sans mapping reste enregistrée pour le reporting mais ne touche pas au stock et crée une anomalie traitable manuellement dans le dashboard ; **(3) écran bar à jour** — un écran d'affichage configuré ne montre que les produits disponibles (stock > 0), avec indicateurs et mentions légales permanentes, et se resynchronise automatiquement quand une vente vide un produit. En complément : exports CSV comptables (ventes/cotisations/mouvements).

## Sous-tickets
{{CHECKLIST}}

## Dépendances
Bloqué par la validation de la démo M6. S'appuie sur le schéma M1 (hub caisse), la fondation webhook M6-07 (SumUp/Zettle réutilisent `verifyWebhookSignature`), et le registre de stock append-only M5 (le décrément de vente passe par le même chemin). Prépare **M8** (durcissement/mise en prod : E2E des parcours vente mappée / vente non mappée, REG-01 frontière NF525).
