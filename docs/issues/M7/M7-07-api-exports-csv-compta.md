---
labels: api, feature, P1
milestone: M7 — Hub caisse & affichage
---
# M7-07 — api : exports CSV comptables (ventes, cotisations, mouvements)

## Contexte
La plateforme n'est **pas** un logiciel de caisse (ADR-09, frontière NF525) : elle **pré-structure** les données pour un outil comptable externe. « Export CSV/Excel des ventes, cotisations, dépenses pour intégration dans un outil comptable externe » (§Comptabilité associée). Ce ticket expose des endpoints d'export **CSV** déterministes, en réutilisant les row-shapers purs de {{M7-01}} (`saleCsvRow`/`contributionCsvRow`/`movementCsvRow` + `toCsv`). SOURCE : `SPEC-ORCHESTRATION.md` §3.6 (comptabilité), ADR-09 ; `SPEC-FONCTIONNELLE.md` §Comptabilité associée.

## Objectif
Un `caisse`/`admin` télécharge un CSV des ventes, des cotisations ou des mouvements de stock sur une période, prêt à importer dans un outil comptable externe.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/exports/{routes,service,repository}.ts` (nouveau module), consomme `toCsv`/row-shapers ({{M7-01}}), tests `apps/api/test/`.
- Hors périmètre explicite : plan de comptes / écritures comptables (explicitement hors périmètre, §Comptabilité) ; génération Excel natif (CSV suffit — ouvrable dans Excel) ; UI ({{M7-11}}).

## Spécification
- **Endpoints** (RBAC ressource `transactions`, `read` — export de données financières agrégées ; `caisse`/`brasseur`/`admin` R) :
  - `GET /exports/sales.csv?from=&to=` — ventes (`ExternalTransaction` `kind = SALE`) : colonnes `date, provider, externalId, montant_eur, moyen_paiement, produit_externe, statut, sku_interne?`.
  - `GET /exports/contributions.csv?from=&to=` — cotisations (`kind = MEMBERSHIP`) : `date, provider, externalId, montant_eur, moyen_paiement, membre?, statut`.
  - `GET /exports/movements.csv?from=&to=` — mouvements de stock (`StockMovement`) : `date, article, delta, unité, motif, batch?, transaction_externe?, note`.
- **Format** : `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="…"`, en-tête de colonnes en 1re ligne, échappement **RFC 4180** (via `toCsv` de {{M7-01}}), montants **euros** formatés depuis les centimes (`units.ts`), dates ISO. Réponse **déterministe** (tri stable `occurredAt`/`createdAt` asc).
- **Bornes de période** : `from`/`to` (ISO, optionnels) validés ; par défaut le mois courant. Volumétrie : paginer la lecture DB en interne (curseur), mais produire un flux CSV complet (streaming) pour ne pas charger tout en mémoire.
- **Read-only** : aucun de ces endpoints n'écrit ; ADR-09 respecté (transactions intactes).

## Definition of Done
- [ ] Tests d'intégration : chaque export renvoie un CSV avec en-tête + lignes attendues (échappement d'un libellé contenant `,`/`"`, montants euros, dates ISO) ; filtre `from`/`to` respecté ; RBAC (`caisse`/`admin` OK, `rgpd` refusé) ; en-têtes HTTP `text/csv` + `Content-Disposition`
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : télécharger `sales.csv`/`contributions.csv`/`movements.csv` sur une période produit un fichier ouvrable dans un tableur, cohérent avec les données

## Dépendances
Bloqué par : {{M7-01}} — Bloque : {{M7-11}}
