---
labels: infra, feature, P0
milestone: M8 — Durcissement & mise en prod
---
# M8-06 — test : E2E « vente mappée », « vente non mappée » et « cycle adhésion »

## Contexte
Suite de {{M8-05}} : les **trois parcours critiques restants** exigés par la spec (SPEC-ORCHESTRATION §6 : « E2E sur les 4 parcours critiques : brassage complet, **vente mappée, vente non mappée, cycle adhésion** »). On réutilise le socle Playwright et les fixtures de {{M8-05}}. Ces parcours exercent le hub caisse (M7) et le cycle adhésion (M6) de bout en bout, y compris les **webhooks signés**. SOURCE : `SPEC-ORCHESTRATION.md` §4, §6 ; `SPEC-FONCTIONNELLE.md` (Caisse & Comptabilité, Membres) ; ADR-09 (hub read-only).

## Objectif
Trois tests Playwright couvrent : une vente **mappée** qui décrémente le stock, une vente **non mappée** qui crée une anomalie, et un **cycle d'adhésion** cotisation → statut à jour.

## Périmètre technique
- Fichiers/dossiers concernés : `e2e/tests/vente-mappee.spec.ts`, `e2e/tests/vente-non-mappee.spec.ts`, `e2e/tests/adhesion.spec.ts` ; helpers d'émission de **webhook signé** (`e2e/helpers/webhook.ts` : corps + signature HMAC valide pour SumUp/Zettle/HelloAsso) ; enrichissement du seed de test si besoin (produit conditionné + mapping, provider).
- Hors périmètre explicite : le socle Playwright ({{M8-05}}, réutilisé) ; le parcours brassage ({{M8-05}}) ; toute modification de l'API (les webhooks/routes existent depuis M6/M7).

## Spécification
- **Vente mappée → stock ↓** : POST webhook **signé** SumUp d'une vente dont l'`externalProductId` est **mappé** à un article conditionné → la transaction est ingérée `MAPPED`, un `StockMovement SALE` (delta < 0) est créé → l'UI (stock / écran d'affichage M7-13) reflète la décrémentation.
- **Vente non mappée → alerte** : POST webhook **signé** d'une vente **sans mapping** → transaction `UNMAPPED`, **aucun** mouvement de stock, une `IntegrationAlert UNMAPPED_TRANSACTION` **OPEN** apparaît au dashboard anomalies (M7-10) ; résolution manuelle possible.
- **Cycle adhésion** : créer/charger un membre → POST webhook **signé** HelloAsso d'une cotisation rapprochée du membre → le **statut de cotisation dérivé** passe à jour (À_JOUR) dans l'UI membres (M6).
- **Signatures** : les webhooks doivent être **réellement signés** (HMAC, en-tête attendu) — un webhook non signé/mal signé est rejeté (vérifiable en complément).
- **Déterminisme** : identifiants externes uniques par test (idempotence), base réinitialisée entre exécutions.

## Definition of Done
- [ ] Les 3 specs passent en local et en **CI** (job E2E de {{M8-05}}) : vente mappée (stock ↓), vente non mappée (anomalie, 0 mouvement), cycle adhésion (statut à jour)
- [ ] Helper de webhook signé (HMAC) réutilisable ; un webhook mal signé est rejeté
- [ ] Pas de régression sur la suite existante ni sur {{M8-05}}
- [ ] Critère observable : les **4 parcours critiques** (avec {{M8-05}}) sont couverts en E2E et bloquants en CI

## Dépendances
Bloqué par : {{M8-05}} — Bloque : —
