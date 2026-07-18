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
                    kind ∈ {RECETTE, BULK, CONDITIONNEMENT, PRODUIT_FINI}
                    (PRODUIT_FINI ajouté en M9 — cf. §9.2 Q10 : les boissons
                     conditionnées sont des CatalogItem, ce qui les rend
                     vendables via SkuMapping et affichables via
                     DisplayScreenItem sans duplication)
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

**Dev step 2 (post-go-live)** — issus du premier test d'usage réel (`docs/briefs/DEV-STEP-2.md`). Cadrage détaillé en **§9**.

| Milestone | Contenu | Critère de démo |
|---|---|---|
| **M9 — Boucle brassin complète** | Cycle de vie du brassin **au-delà du Jour J** : corrections state machine (étapes sans timer, sortie de refroidissement), `WHIRLPOOL` réintégré, assainissement du circuit de refroidissement, alertes de houblonnage, prises de volume, jalons datés post-ensemencement, conditionnement → **stock produits finis** | D'une recette publiée jusqu'au stock : brassin déroulé de bout en bout, conditionné par contenant, produit fini en stock et vendable |
| **M10 — Socle transverse : options, apparence & identité** | Volet « Options générales » (apparence, accès, services, templates), thème dérivé d'une couleur de marque, logo + nom au bandeau, **bascule d'utilisateur par PIN**, fondations design system | Thème et identité de la brasserie appliqués partout ; bascule d'utilisateur en 2 clics + PIN avec badge permanent |
| **M11 — Atelier & catalogue** | Équipement (catégories, fermenteurs/embouteillage, gaz/électrique, mode expert), recettes (réactivité, levure sèche, BJCP familles→sous-familles), calculateur carbonatation soda keg, stock (familles, recherche, masquage stock nul), cartes du bar alimentées par les produits finis | Recette réactive dès l'ouverture, quantité de levure sèche calculée, carte du bar peuplée des seules boissons finies en stock |
| **M12 — Vie associative** | Membres (n° auto, majeur/mineur, âge, adresse détaillée, photo), statut couleur 4 états, acquittement + échéance 12 mois, réparation du lien Cotisations↔Membres, double opt-in email | Adhésion créée → email validé → statut vert, puis orange à 1 mois de l'échéance ; cotisation acquittée visible dans le volet dédié |
| **M13 — Pilotage** | Volet Tâches, agenda interne offline-first (+ export `.ics`), tableau de bord permanent à 6 tuiles | Écran d'accueil affichant en permanence prochain event, volume brassé, brassins en cours, produits finis, météo et tâches à échéance |
| **M14 — Appliance LAN-only** | Socle Proxmox + VM Debian, auto-démarrage/résilience, sauvegardes 2 niveaux, TLS en LAN, procédure de mise à jour avec snapshot préalable | Installation reproductible sur le mini-PC, rollback par snapshot vérifié, restauration testée depuis un support externe |

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

## 9. Dev step 2 — cadrage M9-00 (post-go-live)

> **Statut** : cadrage du lot « dev step 2 », issu du premier test d'usage réel (atelier du 2026-07-18).
> **Entrée** : `docs/briefs/DEV-STEP-2.md` (cahier d'inputs consolidé — n'est pas un plan).
> **Sortie** : le découpage M9→M14 du tableau §4, les arbitrages ci-dessous, et les corps de tickets dans `docs/issues/M9/` et suivants.
>
> M0→M8 sont livrés. Ce lot n'est **pas** une reprise du périmètre V1 : c'est une extension métier (la boucle brassin s'arrêtait à l'ensemencement) doublée d'une montée en qualité UX. Les ADR §0 restent figés ; les trois points qui les touchent passent par des tickets `type:adr` identifiés en §9.3.

### 9.1 Principes de découpage

1. **La boucle brassin d'abord** (M9). C'est le cœur métier et il est incomplet : `mapStep` (`packages/core/src/stateMachine/buildPlan.ts:244`) ignore explicitement `WHIRLPOOL`, `STABILIZE`, `CONDITION` et `PACKAGE`. Tant que le conditionnement ne produit pas de stock, ni les cartes du bar ni le tableau de bord n'ont de matière.
2. **Le socle transverse ensuite** (M10). Apparence, options, accès et bascille d'utilisateur conditionnent l'ergonomie de tout le reste ; les mettre tôt évite de repeindre deux fois.
3. **Le tableau de bord en dernier** (M13). Il agrège M9 (brassins, volumes, produits finis), M12 (membres) et ses propres briques (tâches, agenda) : le planifier avant ses sources produirait des tuiles vides.
4. **L'appliance clôt le lot** (M14), une fois le périmètre fonctionnel stabilisé — on ne fige pas une machine sur une cible mouvante.
5. **La qualité UX est un fil rouge, pas un milestone.** M10 pose les fondations (thème, états vides, primitives responsive) ; chaque ticket `web` ultérieur porte ensuite dans sa DoD la conformité au design system et le responsive. Un milestone « UX » isolé aurait produit une passe cosmétique jetable.

### 9.2 Arbitrage des questions ouvertes du brief (§5)

**Q2 — Règle levure sèche (bloquante). Tranchée : dériver du modèle d'inoculation existant, ne pas inventer de règle g/L.**
`FORMULES-BRASSICOLES.md` §12.1 documente déjà le taux d'inoculation (`cellulesReq = tauxInoc × V(L) × °P`, livré en M8-01). La masse de levure **sèche** s'en déduit avec une seule constante manquante, la densité cellulaire viable par gramme :

```
gSèche = cellulesReq(×10⁹) / DRY_YEAST_CELLS_PER_GRAM(×10⁹/g)
```

Cohérence interne : §12.1 pose déjà « sachet de levure sèche ≈ 200·10⁹ cellules » ; un sachet standard de 11,5 g donne ≈ 17,4·10⁹ cellules/g, ordre de grandeur conforme aux fiches techniques fabricants. **Une règle empirique « x g/L » a été écartée** : le besoin dépend de la densité (°P) autant que du volume, et deux formules divergentes du même domaine dans le même document seraient une dette immédiate. Action préalable au code (ticket M11-04) : sourcer la constante sur au moins deux fiches techniques fabricant, l'écrire en `FORMULES-BRASSICOLES.md` §12.3 avec valeur de référence chiffrée + source en Annexe C, **puis** coder. ADR-11 : la quantité affichée est un **indicateur**, jamais une garantie de bonne fermentation.

**Q3 — Carbonatation soda keg (bloquante). Tranchée : aucune physique nouvelle, réutiliser `kegPressurePsi`.**
`FORMULES-BRASSICOLES.md` §8.2 implémente déjà la régression pression/température/volumes (loi de Henry) et elle est **indépendante de la nature du liquide** — elle vaut pour un soda comme pour une bière. Ce qui manque réellement : (a) la table de référence des **volumes de CO₂ pour sodas et boissons alternatives**, §8.3 ne couvrant que les styles de bière ; (b) les **bornes de validité** de la régression (plage de température et de volumes) ; (c) l'exposition côté moteurs SOFT/ALT. Action préalable au code (M11-06) : compléter §8.3 et borner, puis livrer un calculateur mince par-dessus l'existant. ADR-11 : la pression est un indicateur, assorti de l'alerte de **risque de surpression** déjà exigée par la spec fonctionnelle.

**Q9 — Accès paramétrables par rôle (bloquante). Tranchée : presets lisibles, matrice non éditable ; l'extension passe par un ADR.**
La matrice §3.5 est figée et `apps/api/src/rbac/matrix.ts` porte l'invariant « toute évolution de la matrice = ticket `type:adr` ». Le sous-volet « Accès » de M10 sera donc une **restitution en lecture** de la matrice (qui peut quoi, par rôle), **pas un éditeur**. Trois motifs : déplacer la source de vérité en base détruirait la garantie typée et le deny-by-default ; un admin pourrait se retirer ses propres droits et verrouiller l'instance ; aucun besoin fonctionnel précis ne justifie encore le grain fin. L'édition fine est **reportée** et exigera son propre ADR si le besoin se confirme. Deux extensions réelles de la matrice sont en revanche nécessaires et instruites par le ticket `type:adr` **M10-01** : les ressources `taches` et `agenda`, et l'élargissement de `parametres` aux options générales.

> **Point remonté à Ludo, non tranché** — le brief nomme les profils « admin, brasseur, **trésorier**, RGPD » alors que le code porte `admin, brasseur, **caisse**, rgpd`. C'est une question de dénomination métier, pas technique. Recommandation : **conserver la clé `caisse`** (aucune migration, aucun impact RBAC) et n'ajuster que le libellé affiché en « Trésorier / Caisse ». À confirmer avant M10-01.

**Q10 — Stock produits finis (bloquante). Tranchée : famille intégrée au module Stock M5, pas de store dédié.**
Décision : nouveau `CatalogKind.PRODUIT_FINI`. La preuve est dans le schéma : `SkuMapping.catalogItemId` et `DisplayScreenItem.catalogItemId` pointent **tous deux** sur `CatalogItem`. Un store séparé obligerait donc à dupliquer deux intégrations déjà livrées — le décrément de stock sur vente (M7) et la sélection de produits des écrans (M7). Avec un `kind`, le conditionnement écrit un `StockMovement(reason: PRODUCTION, delta > 0, batchId)` dans le registre append-only existant, et la vente le décrémente **sans une ligne de code nouvelle**. Traçabilité « quel brassin est dans ces bouteilles » : nouvelle table `BatchPackaging` (batch → article produit fini → contenant → quantité). Le lien produit fini → article vendable reste le `SkuMapping` existant.
Conséquence sur ce document : **§3.3 se lit désormais `kind ∈ {RECETTE, BULK, CONDITIONNEMENT, PRODUIT_FINI}`** — extension d'une énumération, aucun ADR remis en cause.

**Questions non bloquantes — arbitrages retenus :**

| # | Sujet | Décision |
|---|---|---|
| Q1 | BJCP | Précédent M1-02 confirmé : les styles restent des **données de référence `core`** (`packages/core/src/reference/bjcpStyles.ts`), pas une table — c'est un standard externe figé, pas une configuration par déploiement (ADR-01). État vérifié : **14 styles**, `category` à plat. M11-05 complète le catalogue 2021 en **familles → sous-familles**. Posture de licence déjà adoptée et maintenue : codes, noms et statistiques vitales uniquement, **aucune prose descriptive** (la partie protégée), avec attribution. Aucune migration. |
| Q4 | Garde 21 j | Ce n'est **pas une formule** mais un défaut métier ⇒ ADR-01 interdit de le coder en dur ⇒ `Settings` (`defaultConditioningDays = 21`, plus fermentation / dry hop / cold crash), ajustable par brassin et borné. Le **calcul des dates** à partir des durées est, lui, de la logique déterministe ⇒ `core` + tests. |
| Q5 | PIN switch-user | PIN **haché Argon2id** comme les mots de passe, jamais en clair ; défini par l'utilisateur dans son profil, réinitialisable par l'admin ; session courte + verrouillage automatique ; **rate-limit et blocage après N échecs obligatoires** (un PIN à 4-6 chiffres est brute-forçable — c'est la contrepartie non négociable de la commodité). Touche ADR-10 ⇒ ticket `type:adr` **M10-02**. |
| Q6 | Météo | **Open-Meteo** (sans clé), latitude/longitude en `Settings`. Tuile masquée si le service est désactivé ou injoignable — jamais d'attente bloquante au rendu (offline-first). |
| Q7 | Emails | SMTP en **variables d'environnement** uniquement (jamais en base). Double opt-in par jeton à usage unique et expirant ; statut **JAUNE** tant que l'adresse n'est pas validée. Gestion des bounces **hors périmètre de ce lot** (traitement manuel) — cohérent avec le cadre LAN-only. |
| Q8 | Photo membre | Blob **local** sur le volume de la VM (pas en base, pas de stockage objet externe). Consentement explicite via le `MemberConsent.PHOTOS` **existant** ; purge à la radiation et à l'anonymisation ; incluse dans l'export RGPD. |
| Q11 | Templates cartes/écrans | Réutiliser l'enum **`DisplayTemplate` existant** (`LIST` / `TABLE` / `CARDS`) — déjà au schéma — enrichi de l'injection de marque (logo, nom, couleur, code hexa de la recette). Aucun nouvel enum. |
| Q12 | Audit | La matrice restreint **déjà** `auditLog` à `admin` (R) et `rgpd` (R) : le « admin-only » demandé est en grande partie acquis côté API, le travail restant est la visibilité côté UI. Ticket d'étude `type:chore` **M11-11** pour définir les KPI de valeur avant tout élargissement. |

**Décisions déléguées du brief §2 — confirmées :** masse thermique **conservée** derrière un mode avancé (elle est réellement consommée par `estimateRampMin`, `buildPlan.ts:92-111` — la retirer dégraderait les rampes du Jour J) ; audit conservé et restreint ; « volume mort » → libellé « perdu » **en UI seulement**, clé `deadspaceL` inchangée, aucune migration ; « DJCP » lu comme **BJCP** ; code hexa de couleur **calculé et conservé** (`ebcToHex` existe en `core`), masqué dans l'éditeur, exposé au panneau d'affichage de vente.

### 9.3 ADR à instruire (tickets `type:adr`, bloquants pour M10)

Trois décisions du brief touchent des ADR figés. Elles ne sont **pas** arbitrées ici : elles passent par un ticket `type:adr` et un fichier `docs/adr/`, conformément à `CLAUDE.md`.

| Ticket | ADR | Objet |
|---|---|---|
| **M10-01** | ADR-12 (nouveau) | Extension de la matrice RBAC §3.5 : ressources `taches` et `agenda`, élargissement de `parametres`. Acte la position « presets lisibles, matrice non éditable » et **réaffirme le deny-by-default**. |
| **M10-02** | ADR-13 (amende ADR-10) | Bascule d'utilisateur par PIN sur poste partagé : PIN Argon2id, session courte, verrouillage automatique, rate-limit et blocage. |
| **M10-03** | ADR-14 (amende ADR-05) | Thème **clair par défaut** et thème dérivé d'une couleur de marque. ⚠️ **Contradiction directe relevée** : ADR-05 et §6 imposent aujourd'hui « mode sombre par défaut », le brief §3.B demande un fond clair par défaut. Le renversement doit être tracé, y compris son impact sur l'exigence de contraste AA en atelier. |

### 9.4 Impacts transverses du lot

- **Schéma / migrations** (append-only, jamais de migration mergée modifiée) : extension `DayPhase` (`WHIRLPOOL`), `CatalogKind` (`PRODUIT_FINI`), nouvelles tables `BatchPackaging`, `BatchMilestone`, `Task`, `AgendaEvent`, champs `Settings` (durées par défaut, apparence, services, géolocalisation météo), champs `Member` (adresse détaillée, photo, acquittement), `User` (PIN haché).
- **Miroir enums `core` ↔ Prisma** : toute valeur ajoutée à un enum Prisma est recopiée dans `packages/core/src/schemas/enums.ts` (valeurs, pas d'import — ADR-03/04). Toute divergence est un bug.
- **Lectures défensives obligatoires** : `recipeSnapshot` est immuable. Les brassins déjà planifiés ne contiendront jamais les nouveaux champs — toute nouvelle étape du Jour J doit être **dérivée** du snapshot existant, jamais exigée de lui (cf. M9-03, assainissement du circuit).
- **RBAC** : M9 n'introduit **aucune ressource nouvelle** — les routes `batches` déclarent déjà `recettes` et le stock produits finis relève de `stocks`. C'est ce qui rend M9 démarrable immédiatement, sans attendre l'ADR-12.
- **Offline-first** : agenda et tâches sont consultables hors ligne ; les services en ligne (météo, emails) se dégradent sans jamais bloquer un rendu.

### 9.5 Mode opératoire

La cadence **« checkpoint + feu vert après chaque ticket »** est maintenue et fait partie du plan : un ticket = une branche = une PR ; à chaque PR mergée, point d'étape et validation de Ludo avant d'enchaîner. Aucun milestone ne démarre avant validation de la démo du précédent.

Conformément à **§5.5**, les corps de tickets sont rédigés **milestone par milestone** : **M9 est rédigé intégralement** dans `docs/issues/M9/` ; M10 à M14 disposent de leur epic et de leur inventaire de tickets (périmètre, dépendances, ancrages), leurs corps détaillés étant écrits à la fin du milestone précédent pour intégrer ce qu'on aura appris. Écrire les ~58 corps aujourd'hui figerait des hypothèses que M9 invalidera.

---

*Fin de la spécification d'orchestration. Version 1.1 — toute évolution passe par PR sur ce document.*
