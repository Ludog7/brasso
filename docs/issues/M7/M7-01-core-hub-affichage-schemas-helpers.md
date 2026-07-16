---
labels: core, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-01 — core : schémas Zod (hub caisse + affichage) + helpers purs (décision de rapprochement, CSV, rendu écran)

## Contexte
Le milestone M7 « Hub caisse & affichage » rend vivant le modèle **déjà posé en {{M1-01}}** (`ExternalProvider`/`ExternalTransaction` append-only, `SkuMapping`, `IntegrationAlert`) et **réutilise la fondation webhook de {{M6-07}}** (signature abstraite par provider, défaut HMAC, idempotence). Comme pour {{M6-02}}, on isole d'abord dans `core` **le métier pur** (déterministe, testable ≥90 %) que l'API (M7-03→08) consomme : les **schémas Zod partagés** (recopiant les enums Prisma, ADR-04) et les **helpers purs** — décision de rapprochement vente↔stock (mode dégradé ADR-09), sérialisation CSV compta, sélection/rendu des produits d'un écran (dispo stock). La **normalisation spécifique** de chaque provider (SumUp/Zettle) reste côté API ({{M7-03}}), comme la normalisation HelloAsso vit dans le module webhooks (cohérence M6-07) ; `core` ne porte que la **forme normalisée cible** et les décisions pures. SOURCE : `SPEC-ORCHESTRATION.md` §3.6 (ADR-09), §3.5 (RBAC), §4 (démo M7) ; `SPEC-FONCTIONNELLE.md` §Module Caisse & Comptabilité, §Module d'affichage.

## Objectif
`packages/core` expose des schémas Zod et des helpers **purs** pour le hub caisse et l'affichage, validés par des tests de référence, prêts à être branchés par l'API sans logique métier dupliquée côté serveur.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/schemas/` (schémas Zod hub caisse + affichage), `packages/core/src/hub/` (nouveau module de helpers purs : décision de rapprochement, CSV, rendu écran) + export dans l'`index.ts` du package, tests `packages/core/test/`.
- Hors périmètre explicite : normalisation des payloads **spécifiques** SumUp/Zettle ({{M7-03}}, côté API) ; tout accès DB/HTTP (core reste pur, ADR-03) ; UI ({{M7-09}}→{{M7-13}}) ; migration ({{M7-02}}).

## Spécification
- **Schémas Zod** (miroir des vues API, dates ISO, montants en **centimes** entiers, ADR-04 recopie les enums, pas d'import Prisma) :
  - `ExternalSaleSchema` — **forme normalisée cible** d'une vente : `externalId`, `amountCents` (int ≥ 0), `currency` (défaut `EUR`), `paymentMethod?`, `externalProductId?`, `itemLabel?`, `occurredAt` (date). C'est le contrat que les normaliseurs SumUp/Zettle de {{M7-03}} doivent produire.
  - `SkuMappingSchema` / `SkuMappingInputSchema` — `internalSku`, `catalogItemId?`, `providerId`, `externalProductId`, `externalCategory?`.
  - `IntegrationAlertSchema` — `type` (`UNMAPPED_TRANSACTION`/`WEBHOOK_FAILURE`/`OTHER`), `status` (`OPEN`/`RESOLVED`), `message`, `providerId?`, `transactionId?`.
  - `DisplaySurfaceInputSchema`, `DisplayScreenInputSchema` (`template` ∈ `LIST`/`TABLE`/`CARDS`, `legalMentions`), `DisplayScreenItemInputSchema` (`catalogItemId`, `flags` : `isNew`/`isFavorite`/`isSpecial`, `sortOrder`, `priceCents?`) — alignés sur le schéma DB de {{M7-02}}.
- **Décision de rapprochement (mode dégradé, ADR-09)** — `resolveSaleReconciliation(sale, mapping | null)` **pur** :
  - `mapping` présent **et** `mapping.catalogItemId` non null → `{ kind: "movement", catalogItemId, delta }` où `delta` est **négatif** (sortie de stock, `reason = SALE`), quantité = 1 unité vendue par défaut (le multiple éventuel — quantité de la ligne de vente — passé en paramètre si le payload l'expose).
  - sinon → `{ kind: "alert", type: "UNMAPPED_TRANSACTION", message }` avec un message lisible type « 1 vente non identifiée sur {provider} le {date} — ajustement manuel du stock requis » (§Mode dégradé). **Jamais** de mouvement de stock quand non mappé.
- **CSV compta** — `toCsv(rows, columns)` **pur et déterministe** : échappement RFC 4180 (guillemets, virgules, retours ligne), séparateur `,`, en-tête depuis `columns`, encodage stable (montants en euros formatés depuis les centimes via `units.ts`, dates ISO). Row-shapers purs : `saleCsvRow`, `contributionCsvRow`, `movementCsvRow` (§Comptabilité associée : ventes, cotisations, mouvements/dépenses). **Aucune** conversion monétaire hors `units.ts`.
- **Rendu d'écran** — `selectDisplayItems(items, stockByCatalogItemId, now)` **pur** : filtre les produits **disponibles** (stock > 0, §Sélection des produits), applique/expose les flags (`nouveau`/`coup de cœur`/`brassin spécial`), trie par `sortOrder`, renvoie la liste projetée pour le template. Aucun effet de bord ; ré-exécutable à chaque changement de stock (base de la sync {{M7-13}}).
- **Wording** : les mentions légales sont du **texte libre porté par l'écran** ({{M7-02}}/{{M7-08}}) — `core` ne code aucun message réglementaire en dur, il fournit seulement la structure.

## Definition of Done
- [ ] Tests core (Vitest) ≥ **90 %** sur le module : `ExternalSaleSchema` accepte/rejette (montant négatif, date invalide) ; `resolveSaleReconciliation` (mappé→mouvement delta négatif ; non mappé/`catalogItemId` null→alerte, aucun mouvement) ; `toCsv` échappe correctement (virgule, guillemet, retour ligne) et formate centimes→euros ; `selectDisplayItems` filtre stock ≤ 0, applique flags, trie
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés ; gate couverture `core` respecté
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : les helpers sont importables depuis `@brasso/core` et couvrent la décision mode-dégradé, le CSV et la sélection d'affichage sans dépendance DB/UI

## Dépendances
Bloqué par : {{M1-01}}, {{M6-02}} — Bloque : {{M7-03}}, {{M7-04}}, {{M7-05}}, {{M7-06}}, {{M7-07}}, {{M7-08}}
