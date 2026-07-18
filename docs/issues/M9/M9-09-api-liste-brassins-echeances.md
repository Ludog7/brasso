---
labels: api, feature, P1
milestone: M9 — Boucle brassin complète
---
# M9-09 — api : liste des brassins avec étape courante et prochaine échéance

## Contexte
Le brief (§3.A.1) demande une vue listant les **brassins passés et en cours** avec le suivi des dates : début, étape courante, prochaine échéance, fin prévue. La route `GET /batches` existe déjà mais ne restitue que les champs bruts du brassin — ni l'étape courante du Jour J, ni la prochaine échéance de jalon. Sans cette agrégation, le front devrait appeler une route par brassin (N+1 requêtes) pour peupler une simple liste.

Cette route sert la vue Brassins ({{M9-10}}) et, plus tard, deux tuiles du tableau de bord M13 (« brassins en cours + date du next step », « volume brassé sur l'année »). SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.1, §3.K.

## Objectif
`GET /batches` restitue en une requête, pour chaque brassin, son statut, son étape courante et sa prochaine échéance datée, avec filtres et pagination.

## Périmètre technique
- Fichiers concernés : `apps/api/src/modules/batches/` (`routes.ts`, `service.ts`, `repository.ts`, `schema.ts`) ; tests `apps/api/tests/`.
- Hors périmètre explicite : l'UI (M9-10) ; le tableau de bord (M13) ; l'agenda (M13) ; toute nouvelle table.

## Spécification

**A. Enrichissement de la liste.** Pour chaque brassin : identité (numéro, nom de recette issu du `recipeSnapshot`, moteur), statut, dates clés, **étape courante** (depuis `BatchDayState` pour un brassin en brassage, sinon le jalon en cours depuis `BatchMilestone`), **prochaine échéance** (`plannedEndAt` du prochain jalon non achevé) et **fin prévue** (dernier jalon). Le nom de recette se lit **défensivement** dans le snapshot : un snapshot ancien ou corrompu ne doit pas faire échouer la liste entière — repli sur le numéro de brassin.

**B. Filtres et tri.** Filtres : statut (multiple), période, recette, « en cours » vs « terminés ». Tri par défaut : brassins **en cours d'abord**, puis par prochaine échéance croissante — c'est l'ordre utile à l'atelier (ce qui réclame une action apparaît en tête). Pagination avec une taille par défaut raisonnable et un plafond, pour ne pas dégrader la tablette quand l'historique grossira.

**C. Performance.** Interdiction du N+1 : les jalons et états du jour se chargent en **requêtes groupées**, pas dans une boucle par brassin. Les index posés en M9-02 (`@@index([batchId])`, `@@index([plannedEndAt])`) sont là pour ça. Vérifier le comportement sur un jeu de données réaliste plutôt que sur trois brassins de test.

**D. RBAC.** Ressource existante `recettes`, action `read` — aucune ressource nouvelle. La route existante conserve son couple ; les paramètres de filtre ne contournent aucun contrôle.

**E. Volume brassé agrégé.** Exposer, sur la même route ou une route de synthèse dédiée, le **volume total brassé sur une période** (somme des volumes conditionnés, à défaut ensemencés). Cette valeur alimentera la tuile M13 : la produire ici évite que le tableau de bord recalcule une agrégation métier côté front.

## Definition of Done
- [ ] Tests d'intégration API : liste enrichie (étape courante, prochaine échéance, fin prévue) pour un brassin en brassage, un en fermentation, un terminé et un annulé
- [ ] Test de **lecture défensive** : un `recipeSnapshot` corrompu n'empêche pas la liste de se rendre (repli sur le numéro)
- [ ] Tests des filtres, du tri par défaut et de la pagination (dont le plafond)
- [ ] Test **anti-N+1** : le nombre de requêtes ne croît pas avec le nombre de brassins
- [ ] Test de l'agrégation « volume brassé sur une période »
- [ ] Test RBAC : lecture autorisée pour `admin`/`brasseur`/`caisse`, refusée pour `rgpd`
- [ ] Lint + typecheck + CI verts ; Prettier sur tous les fichiers touchés
- [ ] Critère observable : un seul appel `GET /batches` suffit à peupler la vue Brassins complète

## Dépendances
Bloqué par : {{M9-02}}, {{M9-07}} — Bloque : {{M9-10}}
