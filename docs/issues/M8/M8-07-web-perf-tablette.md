---
labels: web, chore, P1
milestone: M8 — Durcissement & mise en prod
---
# M8-07 — web : durcissement des performances tablette (budgets, code-splitting, PWA offline)

## Contexte
M8 inclut la **perf tablette** (SPEC-ORCHESTRATION §4). L'app cible un usage **atelier sur tablette** (§6 : UI atelier, mode sombre, cibles ≥ 48 px) et un fonctionnement **offline** sur le Jour J (PWA, ADR-08). Le build actuel émet déjà un **chunk unique > 500 Ko** (avertissement Vite) : ce ticket réduit le poids initial, découpe le code par route et **vérifie le comportement offline** de la PWA. SOURCE : `SPEC-ORCHESTRATION.md` §4, §6 ; ADR-05 (mode sombre), ADR-08 (offline Jour J).

## Objectif
Le chargement initial sur tablette est allégé (code-splitting par route, budget respecté) et le fonctionnement offline du Jour J est vérifié.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/App.tsx` (routes en `lazy`/`Suspense`), `apps/web/vite.config.ts` (chunking manuel si utile, budget), configuration PWA/service worker existante, éventuelle mesure Lighthouse/bundle documentée dans `docs/`.
- Hors périmètre explicite : refonte visuelle ; nouvelles fonctionnalités ; le back-end. On **optimise l'existant**, sans changer les comportements.

## Spécification
- **Code-splitting** : charger les routes en `React.lazy` + `Suspense` (fallback léger cohérent avec le `Splash` existant) pour que le bundle initial ne contienne que le socle (login + shell) ; supprimer l'avertissement Vite « chunk > 500 Ko » ou le justifier via un chunking explicite.
- **Budget** : fixer un budget de taille (ex. via `build.chunkSizeWarningLimit` raisonné + note) et vérifier qu'il tient après split.
- **PWA offline** : vérifier que le service worker précache correctement le shell et que le **Jour J reste opérant hors ligne** (file d'actions offline M4-14 intacte) ; documenter la vérification (couper le réseau, dérouler une étape, resynchroniser).
- **Non-régression** : aucune modification de comportement fonctionnel ; toute la suite web reste verte ; le lazy-loading ne casse pas les tests (adapter les `findBy*` si nécessaire).

## Definition of Done
- [ ] Routes chargées en `lazy`/`Suspense` ; bundle initial réduit ; avertissement « chunk > 500 Ko » résolu ou justifié par un budget documenté
- [ ] Vérification PWA offline du Jour J documentée (shell précaché, file offline M4 opérante hors ligne)
- [ ] Lint + CI verte ; **suite web sans régression** (140+ tests)
- [ ] Critère observable : le build ne dépasse plus le budget fixé et le Jour J fonctionne réseau coupé

## Dépendances
Bloqué par : validation de la démo M7 (front complet M2–M7) — Bloque : —
