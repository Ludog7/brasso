# BRASSO — Spécification & orchestration du projet

> **Plateforme de gestion de microbrasserie associative** — recettes multi-boissons, batchs tracés, Jour J, stocks, membres, hub caisse, affichage.
>
> **Repo** : `github.com/ludog7/brasso`
> **Mode d'exécution** : Claude Code, piloté par Ludo (product owner + validation).
> **Périmètre V1** : Niveaux 1 + 2 complets. Livraison par milestones séquentiels, chacun démontrable.
>
> Ce document est la **source de vérité du cadrage**. Les documents `FORMULES-BRASSICOLES.md` et les règles métier de la spec fonctionnelle sont référencés, pas dupliqués.

---

## 0. Décisions d'architecture (ADR résumés)

Chaque décision ci-dessous est **figée**. Toute remise en cause passe par un ticket `type:adr`.

| # | Décision | Justification | Conséquences |
|---|---|---|---|
| ADR-01 | **Mono-tenant, conçu migrable** | Une seule asso aujourd'hui ; ne pas payer le coût multi-tenant maintenant | Pas de `tenantId` dans le schéma. MAIS : aucune constante métier hardcodée (nom asso, profils d'eau, TVA → table `settings`), IDs `cuid` partout, auth découplée. Migration future = ajout d'une colonne + middleware, pas une refonte. |
| ADR-02 | **PostgreSQL 16** | Multi-utilisateurs, rôles, transactions concurrentes le Jour J, JSONB pour snapshots et recettes alternatives | Docker service dédié. Prisma comme ORM. SQLite abandonné. |
| ADR-03 | **Monorepo TypeScript** (pnpm workspaces) | Un langage, types partagés, formules uniques front/back | `packages/core`, `packages/db`, `apps/api`, `apps/web` |
| ADR-04 | **API Fastify + Zod, REST** | Léger, typé, rapide à générer/tester par IA | GraphQL rejeté (complexité non justifiée V1) |
| ADR-05 | **Front React 18 + Vite, PWA** | Cible tablette atelier ; PWA = installable + base offline | Tailwind + shadcn/ui, gros boutons, mode sombre par défaut |
| ADR-06 | **Polymorphisme recettes : table commune + tables de détail par moteur** | Évite les 40 colonnes nullable ; chaque moteur a son intégrité propre | `Recipe` (commun) + `RecipeBeerDetails` / `RecipeAltDetails` / `RecipeSoftDetails` (1-1) |
| ADR-07 | **Recette versionnée immuable + snapshot JSON sur Batch** | Traçabilité associative : un batch fige l'état exact de sa recette | Modifier une recette publiée = nouvelle version. Le batch stocke `recipeSnapshot` JSONB. |
| ADR-08 | **State machine Jour J : serveur = source de vérité, client = cache résilient** | Tablette + wifi d'atelier instable | V1 : file d'actions locale (IndexedDB) rejouée à la reconnexion, timers côté client avec horodatage serveur à la sync. Offline complet = V2. |
| ADR-09 | **Transactions externes read-only, ingérées par webhooks** | Frontière NF525 : aucun encaissement créé/modifié dans Brasso | Table `ExternalTransaction` append-only. Mode dégradé "non mappé" = alerte + pas de mouvement stock. |
| ADR-10 | **Auth session cookie + RBAC maison** | Selfhosted, pas de dépendance SaaS ; 4 rôles suffisent | Pas de Keycloak/Auth0 en V1. Argon2id pour les mots de passe. |
| ADR-11 | **Indicateurs pH/sécurité = aide à la décision, jamais validation** | Risque juridique/sanitaire d'un badge "conforme" | Wording UI imposé : "indicateur", jamais "conforme/sûr". Disclaimer permanent sur les écrans concernés. Tickets `regulatory` dédiés. |

### 0.1 Points réglementaires à valider HORS développement

Deux validations externes sont **prérequises avant la mise en production** (pas avant le début du dev) :

1. **Frontière NF525** : confirmation par un expert-comptable que le rôle "hub read-only" n'entre pas dans le champ des logiciels de caisse. → issue `REG-01`, milestone M8.
2. **Module pH/stabilisation** : relecture par une personne compétente en hygiène alimentaire (HACCP) du wording et de la logique d'alerte. → issue `REG-02`, milestone M8.

---

## 1. Stack technique définitive

| Couche | Techno | Version |
|---|---|---|
| Runtime | Node.js | 22 LTS |
| Monorepo | pnpm workspaces + turborepo | — |
| API | Fastify | 5.x |
| Validation | Zod (schémas partagés dans `core`) | 3.x |
| ORM / migrations | Prisma | 6.x |
| DB | PostgreSQL | 16 |
| Front | React + Vite + TypeScript | 18 / 6 |
| UI | Tailwind CSS 4 + shadcn/ui | — |
| State serveur | TanStack Query | 5.x |
| State local / offline | Zustand + IndexedDB (idb) | — |
| Graphiques | Recharts | — |
| PWA | vite-plugin-pwa (Workbox) | — |
| Tests unitaires/intégration | Vitest | — |
| Tests E2E | Playwright | — |
| Lint/format | ESLint 9 (flat) + Prettier | — |
| CI | GitHub Actions | — |
| Conteneurs | Docker Compose (app + postgres + caddy) | — |
| Reverse proxy / TLS | Caddy | — |

---

## 2. Structure du repo

```
brasso/
├── .github/
│   ├── workflows/ci.yml              # lint + test + build sur PR
│   ├── ISSUE_TEMPLATE/
│   │   ├── feature.yml
│   │   ├── bug.yml
│   │   └── adr.yml
│   └── pull_request_template.md
├── docs/
│   ├── SPEC-ORCHESTRATION.md         # ce document
│   ├── FORMULES-BRASSICOLES.md       # référentiel formules (déjà produit)
│   ├── SPEC-FONCTIONNELLE.md         # la spec métier (document fourni)
│   ├── adr/                          # un fichier par ADR au-delà de ce doc
│   └── runbooks/                     # install, backup, restore
├── packages/
│   ├── core/                         # CŒUR MÉTIER — zéro dépendance UI/DB
│   │   ├── src/
│   │   │   ├── engines/
│   │   │   │   ├── beer.ts           # BEER_ENGINE (OG/FG/ABV/IBU/EBC/BJCP)
│   │   │   │   ├── altFermented.ts   # ALT_FERMENTED_ENGINE (ABV, pH, carbo résiduelle)
│   │   │   │   └── softDrink.ts      # SOFT_DRINK_ENGINE (sucre, pH)
│   │   │   ├── formulas/             # implémentation FORMULES-BRASSICOLES.md
│   │   │   ├── units.ts
│   │   │   ├── stateMachine/         # définition états/transitions Jour J (pure)
│   │   │   └── schemas/              # Zod partagés (recette, batch, stock…)
│   │   └── tests/                    # ≥90 % de couverture exigée
│   ├── db/
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   └── seed/                     # catalogue ingrédients, styles BJCP, rôles
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── plugins/              # auth, rbac, error handler
│   │   │   ├── modules/              # 1 dossier = 1 domaine (recipes, batches, …)
│   │   │   │   └── <domaine>/{routes,service,repository}.ts
│   │   │   └── webhooks/             # helloasso.ts, sumup.ts, zettle.ts
│   │   └── tests/
│   └── web/
│       ├── src/
│       │   ├── routes/               # React Router, 1 dossier par écran
│       │   ├── features/             # composants métier par domaine
│       │   ├── offline/              # file d'actions IndexedDB + sync
│       │   └── ui/                   # composants shadcn adaptés "atelier"
│       └── tests/
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile
├── Caddyfile
├── CLAUDE.md                          # mémoire projet Claude Code (voir §7)
└── README.md
```

---

## 3. Modèle de données — points structurants

Le schéma Prisma complet est produit au ticket `M1-01`. Ici, les décisions qui le structurent (le détail des champs suit la spec fonctionnelle) :

### 3.1 Recettes polymorphes (ADR-06)

```
Recipe                    ← commun : id, name, engine, status, version, familyId
├── RecipeBeerDetails     ← styleBjcp, targetOg/Fg/Ibu/Ebc, boilTime, efficiency
├── RecipeAltDetails      ← baseType (ginger/miel/kombucha…), targetPh,
│                            stabilizationMethod (OBLIGATOIRE), residualSugarRisk
└── RecipeSoftDetails     ← sugarConcentration, targetPh, storageMode
RecipeIngredient          ← polymorphe par catégorie (voir 3.3)
RecipeProcessStep         ← ordonné : type (mash/boil/ferment/stabilize…), params JSONB
```

- `engine ∈ {BEER, ALT_FERMENTED, SOFT_DRINK}` détermine la table de détail et le moteur `core` utilisé.
- **Versioning** : `familyId` regroupe les versions d'une même recette ; `(familyId, version)` unique ; `status ∈ {DRAFT, PUBLISHED, ARCHIVED}`. Une recette `PUBLISHED` est immuable : l'éditer crée un `DRAFT` version n+1.
- **Contrainte moteur ALT** : `stabilizationMethod` non-null obligatoire pour publier (règle de validation `core`, pas seulement DB).

### 3.2 Batch (ADR-07)

```
Batch : id, batchNumber (séquence lisible), recipeId + recipeVersion,
        recipeSnapshot JSONB, equipmentProfileId, status,
        dates clés, measures[], deviationLogs[], brewers[]
BatchMeasure    : type (gravity/temp/ph/volume), value, phase, loggedAt, loggedBy
DeviationLog    : étape, motif, auteur, timestamp — créé par "Forcer l'étape"
BatchDayState   : état courant de la state machine Jour J (étape, timers, horodatages)
```

Statuts : `PLANIFIE → EN_BRASSAGE → EN_FERMENTATION → EN_CONDITIONNEMENT → TERMINE` (+ `ANNULE`).

### 3.3 Stock à deux logiques

```
CatalogItem       : catalogue (malts, sucres, houblons, levures, adjuvants,
                    gaz, nettoyants, bouteilles, capsules, fûts…)
                    kind ∈ {RECETTE, BULK, CONDITIONNEMENT}
StockLot          : lot physique (quantité, DLU, coût en centimes)
StockMovement     : registre append-only (delta, reason, batchId?, userId)
StockReservation  : réservation à la planification d'un batch, consommée
                    à l'ensemencement (ajustée au volume réel)
```

- `RECETTE` : réservation à la planification → déduction effective à l'ensemencement (transaction).
- `BULK` : mouvements manuels/forfaitaires uniquement, inventaire périodique.
- Alertes de seuil différenciées par `kind`.

### 3.4 Membres, rôles, RGPD

```
Member          : identité, coordonnées, memberNumber, statut cotisation
MemberConsent   : type (communication/photos/notifications), granted, date — historisé
User            : compte de connexion (lié ou non à un Member), passwordHash
Role / UserRole : RBAC (voir 3.5)
AuditLog        : accès aux données personnelles + actions sensibles (append-only)
```

**Séparation stricte** : les données techniques (batchs, stocks) ne référencent que `User.id`, jamais les données personnelles de `Member`. La pseudonymisation post-délai légal remplace l'identité du `Member` en conservant les agrégats comptables (ticket dédié `M6-08`).

### 3.5 Matrice RBAC (figée V1)

| Ressource | admin | brasseur | caisse | rgpd |
|---|---|---|---|---|
| Recettes / Batchs / Jour J | CRUD | CRUD | R | — |
| Stocks | CRUD | CRUD | R | — |
| Membres (identité, consentements) | CRUD | — | — | CRUD + export/anonymisation |
| Transactions externes / mapping SKU | CRUD | R | CRUD mapping, R transactions | — |
| Affichage écrans | CRUD | RU | RU | — |
| Paramètres / utilisateurs | CRUD | — | — | — |
| AuditLog | R | — | — | R |

Toute route API déclare son couple (ressource, action) ; le plugin RBAC refuse par défaut (deny-by-default).

### 3.6 Hub caisse (ADR-09)

```
ExternalProvider     : HELLOASSO | SUMUP | ZETTLE (config, secrets webhook)
ExternalTransaction  : append-only, payload brut JSONB + champs normalisés
SkuMapping           : SKU interne ↔ identifiant produit externe
IntegrationAlert     : transaction non mappée / webhook en échec → dashboard anomalies
```

Pipeline : webhook signé → validation → persistance brute → normalisation → si mapping trouvé : mouvement stock conditionné ; sinon : `IntegrationAlert`.

---

## 4. Découpage en milestones GitHub

Chaque milestone = un jalon **démontrable**. Ordre strict M0→M8 (des dépendances croisées existent, elles sont matérialisées par des références entre issues).

| Milestone | Contenu | Critère de démo |
|---|---|---|
| **M0 — Socle** | Monorepo, Docker (app+pg+caddy), Prisma init, CI, auth+RBAC, CLAUDE.md, templates issues | `docker compose up` → login, rôles fonctionnels, CI verte |
| **M1 — Modèle & core** | Schéma Prisma complet, seed (ingrédients, BJCP, rôles), `packages/core` : 3 moteurs + formules + state machine pure + tests ≥90 % | Suite de tests core verte avec valeurs de référence validées |
| **M2 — Recettes** | CRUD 3 types de recettes, versioning/publication, éditeur temps réel par moteur (jauges BJCP / pH / sucre), import-export BeerXML (BEER uniquement) + schéma JSON propriétaire (ALT/SOFT) | Créer, publier, versionner une recette de chaque type avec calculs justes |
| **M3 — Équipements & batchs** | Profils d'équipement (deadspace, évaporation, calorique, profils d'eau), strike temp, création de batch (snapshot + n° + réservation stock), plan de fermentation, journal, graphes | Planifier un batch depuis une recette publiée, stock réservé |
| **M4 — Jour J** | State machine complète (UI tablette), timers "démarrage après stabilisation température", mode normal / Forcer l'étape + DeviationLog, corrections densité pré-ébullition avec impact estimé, file d'actions offline (ADR-08) | Dérouler un brassage complet sur tablette, wifi coupé 10 min sans perte |
| **M5 — Stocks complets** | Logique RECETTE (réservation→déduction), BULK (manuel/forfait), inventaires, alertes de seuil, coût de revient par batch | Un batch ensemencé décrémente le stock ; coût de revient calculé |
| **M6 — Membres & RGPD** | CRUD membres, consentements historisés, webhook HelloAsso cotisations → rapprochement membre, AuditLog, export/rectification/anonymisation | Cycle complet adhésion → cotisation HelloAsso → statut à jour |
| **M7 — Hub caisse & affichage** | Webhooks SumUp/Zettle, mapping SKU, mode dégradé + dashboard anomalies, exports CSV compta, module écrans (surfaces, templates, sync stock, mentions légales) | Vente test SumUp → stock décrémenté ; vente non mappée → alerte ; écran bar à jour |
| **M8 — Durcissement & mise en prod** | E2E Playwright (parcours critiques), backups pg_dump + restauration testée, runbooks, perf tablette, REG-01/REG-02, calculateurs autonomes (starter, eau, dilution, BIAB) | Installation from scratch documentée + restauration backup réussie |

> **Avertissement assumé** : tu as choisi le périmètre complet (N1+N2). Même exécuté par Claude Code, le risque principal n'est pas la production de code mais **l'intégration et la validation métier par toi** à chaque milestone. La parade est dans le process : aucune milestone suivante ne démarre tant que la démo de la précédente n'est pas validée par tes soins. Ne saute pas cette étape, c'est elle qui protège le projet.

---

## 5. Orchestration GitHub Issues

### 5.1 Labels (à créer au ticket M0-02)

```
domaine   : core | api | web | db | infra | docs
type      : feature | bug | adr | regulatory | chore
priorité  : P0 (bloquant) | P1 | P2
statut    : blocked (+ référence de l'issue bloquante en commentaire)
```

### 5.2 Format de ticket (calibré Claude Code)

Chaque ticket doit être **exécutable en autonomie dans une session Claude Code** : contexte complet, pas de savoir implicite. Template `feature.yml` :

```markdown
## Contexte
[2-5 lignes : pourquoi, référence à la section de SPEC-ORCHESTRATION.md
 ou SPEC-FONCTIONNELLE.md qui fait foi]

## Objectif
[Résultat observable, une phrase]

## Périmètre technique
- Fichiers/dossiers concernés :
- Hors périmètre explicite :

## Spécification
[Détail : schémas, routes, règles métier, formules référencées]

## Definition of Done
- [ ] Tests (unitaires core obligatoires si formule/règle métier)
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] [critère fonctionnel observable]

## Dépendances
Bloqué par : #xx — Bloque : #yy
```

### 5.3 Granularité et volumétrie

- Un ticket = **une session Claude Code** (cible : 1 à 4 h de travail équivalent). Si c'est plus gros → epic découpée.
- Estimation : **M0 ≈ 8 tickets, M1 ≈ 14, M2 ≈ 12, M3 ≈ 10, M4 ≈ 14, M5 ≈ 8, M6 ≈ 9, M7 ≈ 12, M8 ≈ 8** → ~95 tickets au total.
- Les epics sont des issues chapeau (`type:feature`, checklist d'issues filles), une par grand bloc fonctionnel.

### 5.4 Workflow de développement

```
1. Ludo (ou Claude Code sur instruction) prend le ticket P0 le plus ancien non bloqué
2. Branche : feat/<n°issue>-<slug>   (ex. feat/42-state-machine-timers)
3. Claude Code implémente : code + tests + doc si impact
4. PR vers main, template rempli, "Closes #42"
5. CI verte obligatoire (lint, tests, build)
6. Revue par Ludo : validation fonctionnelle (pas relecture ligne à ligne —
   la CI et les tests portent la qualité technique, toi tu portes le métier)
7. Squash merge. Le ticket se ferme. Milestone burndown à jour.
```

Règles :
- `main` protégée : merge uniquement par PR avec CI verte.
- Un bug découvert = un ticket `type:bug` rattaché au milestone courant, jamais de fix silencieux.
- Toute décision d'architecture en cours de route = ticket `type:adr` + fichier dans `docs/adr/`.

### 5.5 Script d'amorçage (ticket M0-02)

La création des ~95 tickets est **scriptée** (`scripts/bootstrap-issues.sh`) via `gh` :

```bash
# labels
gh label create "core" --color 1d76db ; gh label create "P0" --color b60205 ; ...
# milestones
gh api repos/ludog7/brasso/milestones -f title="M0 — Socle" ...
# issues depuis des fichiers markdown versionnés dans docs/issues/
for f in docs/issues/M0/*.md; do
  gh issue create --title "$(head -1 $f | sed 's/# //')" \
    --body-file "$f" --milestone "M0 — Socle" --label "$(labels_from_frontmatter $f)"
done
```

Les corps de tickets vivent dans `docs/issues/M*/**.md` : versionnés, relisibles, régénérables. **Première tâche concrète du projet** : je rédige M0 + M1 en entier (~22 tickets), les milestones suivants sont rédigés à la fin du milestone précédent (pour intégrer ce qu'on a appris).

---

## 6. Exigences transverses (rappel contractuel)

- **UI atelier** : cibles tactiles ≥ 48 px, contraste AA minimum, mode sombre par défaut, zéro drag-and-drop sur les parcours Jour J.
- **Sécurité** : Argon2id, cookies `httpOnly/secure/sameSite`, rate-limit sur login et webhooks, secrets uniquement en variables d'environnement, webhooks vérifiés par signature.
- **RGPD by design** : minimisation (pas de date de naissance si non nécessaire), consentements historisés, AuditLog sur toute lecture de données personnelles, procédure d'anonymisation testée.
- **Wording sécurité alimentaire** (ADR-11) : les écrans pH/stabilisation portent en permanence : *« Indicateur d'aide à la décision — ne remplace pas une validation d'hygiène alimentaire professionnelle. »*
- **Qualité** : couverture `core` ≥ 90 % ; chaque formule validée contre les valeurs de référence de `FORMULES-BRASSICOLES.md` ; E2E sur les 4 parcours critiques (brassage complet, vente mappée, vente non mappée, cycle adhésion).

---

## 7. CLAUDE.md (mémoire projet — à créer au ticket M0-01)

Contenu minimal du fichier à la racine, qui pilote toutes les sessions Claude Code :

```markdown
# Brasso — mémoire projet
- Lis docs/SPEC-ORCHESTRATION.md avant toute implémentation. Les ADR sont figés.
- Formules brassicoles : docs/FORMULES-BRASSICOLES.md fait foi. Jamais de formule de mémoire.
- Un ticket = une branche = une PR. Jamais de commit direct sur main.
- Tests obligatoires pour tout code dans packages/core. Couverture ≥ 90 %.
- Unités internes : g, L, °C, SG brute, EBC, fractions alpha, centimes. Conversions dans core/units.ts uniquement.
- Wording sécurité alimentaire : "indicateur", jamais "conforme". Cf. ADR-11.
- PowerShell/Windows côté poste de pilotage : scripts fournis en bash (CI/conteneur) ET compatibles Git Bash.
- Ne jamais modifier une migration Prisma déjà mergée : nouvelle migration.
```

---

## 8. Lancement — les 3 premières actions

1. **Toi** : `git clone` du repo vide, dépôt des 3 documents dans `docs/` (cette spec, les formules, la spec fonctionnelle).
2. **Moi (prochaine étape si tu valides)** : rédaction des corps de tickets M0 + M1 complets dans `docs/issues/`, du script `bootstrap-issues.sh`, et du `CLAUDE.md`.
3. **Claude Code** : exécution de M0-01 (init monorepo) → la machine est lancée.

---

*Fin de la spécification d'orchestration. Version 1.0 — toute évolution passe par PR sur ce document.*
