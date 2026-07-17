---
labels: infra, feature, P0
milestone: M8 — Durcissement & mise en prod
---
# M8-05 — test : socle E2E Playwright + parcours « brassage complet »

## Contexte
M8 verrouille les **parcours critiques** par des tests E2E Playwright (SPEC-ORCHESTRATION §4, §6 : « E2E sur les 4 parcours critiques »). Ce premier ticket **met en place le socle Playwright** (config, intégration CI, base/fixtures seedées, helpers d'auth par rôle) et couvre le **premier des 4 parcours** : un **brassage complet** (recette publiée → batch planifié → déroulé Jour J). Les 3 autres parcours suivent en {{M8-06}}. La stack de test est déjà Playwright (SPEC §1). SOURCE : `SPEC-ORCHESTRATION.md` §4, §6 ; `SPEC-FONCTIONNELLE.md` (parcours brassage) ; `docs/DEV.md` (commandes/CI).

## Objectif
Un test Playwright déroule de bout en bout un brassage (recette → batch → Jour J) contre l'app réelle, et tourne en CI.

## Périmètre technique
- Fichiers/dossiers concernés : `e2e/` (nouveau : `playwright.config.ts`, `fixtures/` seed dédié, `helpers/` auth par rôle, `tests/brassage.spec.ts`) ; intégration CI (job E2E dans le workflow existant, services app+postgres) ; scripts `package.json` racine (`test:e2e`). Réutilise le seed existant (`packages/db`).
- Hors périmètre explicite : les parcours caisse/adhésion ({{M8-06}}) ; les tests unitaires/RTL existants (inchangés) ; le durcissement perf ({{M8-07}}).

## Spécification
- **Socle** : `playwright.config.ts` (navigateur chromium tablette, baseURL, retries CI, artefacts trace/vidéo à l'échec) ; démarrage de l'app (compose ou `webServer`) + **base de test isolée** seedée de façon déterministe (compte par rôle : admin/brasseur/caisse ; référentiels) ; helpers `loginAs(role)` (session cookie). Le job CI lance l'app + postgres et exécute `test:e2e`.
- **Parcours brassage complet** (`brassage.spec.ts`) : se connecter (brasseur) → ouvrir une recette **publiée** (seed) → **planifier un batch** (snapshot + n° + réservation stock) → démarrer le **Jour J** → dérouler quelques étapes de la state machine (START/VALIDATE, une stabilisation) → arriver à un état cohérent. Assertions sur les jalons observables (batch créé, stock réservé, progression Jour J).
- **Déterminisme** : données seedées, pas d'horaire réel bloquant (le parcours ne doit pas dépendre d'un timer long réel — viser les transitions, pas l'attente d'un palier de 60 min).
- **Robustesse CI** : base réinitialisée entre exécutions ; artefacts à l'échec.

## Definition of Done
- [ ] `e2e/` opérationnel : config Playwright + app+DB de test seedée + helpers d'auth par rôle ; `pnpm test:e2e` vert en local
- [ ] `brassage.spec.ts` déroule recette publiée → batch planifié (stock réservé) → Jour J progressé, avec assertions
- [ ] **Job E2E intégré à la CI** (bloquant), artefacts (trace/vidéo) à l'échec
- [ ] Pas de régression sur la suite existante
- [ ] Critère observable : la CI exécute un brassage complet de bout en bout et échoue si le parcours casse

## Dépendances
Bloqué par : validation de la démo M7 (parcours brassage M2–M5 livrés) — Bloque : {{M8-06}}
