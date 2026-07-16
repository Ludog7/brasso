---
labels: web, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-10 — web : dashboard des anomalies d'intégration (traitement manuel)

## Contexte
Le mode dégradé impose une **vue tableau de bord dédiée aux anomalies** pour le traitement manuel des stocks (§Mode dégradé : « traitement manuel des stocks, formation des bénévoles »). Elle consomme l'API anomalies ({{M7-06}}) : liste des `IntegrationAlert` ouvertes, résolution avec ajustement de stock manuel optionnel. **Réutiliser les patterns** d'un feature web existant (ex. `features/cash` {{M7-09}}, `features/stock` M5). SOURCE : `SPEC-FONCTIONNELLE.md` §Mode dégradé ; `SPEC-ORCHESTRATION.md` §3.6 (dashboard anomalies).

## Objectif
Un bénévole `caisse`/`admin` voit les anomalies (ventes non mappées, webhooks en échec), comprend leur cause, et les résout — avec un ajustement de stock manuel si nécessaire.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/alerts/` (`hooks.ts` + `alertKeys`, `labels.ts`, `AlertList.tsx`, `AlertResolveDialog.tsx`, `AlertTypeBadge.tsx`), route `apps/web/src/routes/alerts/…`, entrée de navigation (masquée hors rôle) éventuellement avec **compteur d'anomalies ouvertes**, `apps/web/src/lib/api.ts` (`alertsApi`), tests `apps/web/src/test/alerts.test.tsx`.
- Hors périmètre explicite : caisse/mapping ({{M7-09}}) ; exports ({{M7-11}}). Réutiliser `DialogShell`/toasts existants.

## Spécification
- **`alertsApi`** : `list({status?, type?})`, `get(id)`, `resolve(id, { stockAdjustment? })`. Types miroir de {{M7-06}}.
- **`AlertList`** : tableau des anomalies (type, message, provider, transaction liée : montant/date/produit externe, statut, date) ; filtre `OPEN`/`RESOLVED` ; `AlertTypeBadge` (`UNMAPPED_TRANSACTION` / `WEBHOOK_FAILURE`). Badge/compteur d'anomalies **ouvertes** visible dans la nav.
- **`AlertResolveDialog`** : bouton « Résoudre » → dialogue proposant un **ajustement de stock optionnel** (`catalogItem`, `delta`, note) pour compenser une vente non identifiée, puis `POST /alerts/:id/resolve`. Message clair rappelant que l'ajustement est **manuel** (l'app n'est pas une caisse, ADR-09).
- **RBAC UI** : lecture pour `caisse`/`brasseur`/`admin` ; action « résoudre » visible pour `caisse`/`admin` ; écran masqué pour `rgpd`.
- **A11y/atelier** : cibles ≥ 48 px, contraste AA, mode sombre.

## Definition of Done
- [ ] Tests web (Vitest/RTL, faux `fetch`) : liste filtrée `OPEN`/`RESOLVED` + `AlertTypeBadge` ; résolution simple (POST) et résolution **avec ajustement de stock** ; compteur d'anomalies ouvertes ; RBAC UI (résolution masquée hors `caisse`/`admin` ; écran masqué pour `rgpd`)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une vente non mappée apparaît dans le dashboard ; le bénévole la résout avec un ajustement de stock manuel

## Dépendances
Bloqué par : {{M7-06}} — Bloque : —
