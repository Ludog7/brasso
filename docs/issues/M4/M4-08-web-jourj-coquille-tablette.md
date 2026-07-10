---
labels: web, feature, P0
milestone: M4 — Jour J
---
# M4-08 — web : coquille Jour J tablette (PWA, layout atelier, shell offline)

## Contexte
Cible **tablette d'atelier** (ADR-05) : PWA installable, base offline, cibles tactiles **≥ 48 px**, contraste AA, **mode sombre par défaut**, **zéro drag-and-drop** sur les parcours Jour J (§ UI atelier, SPEC-ORCHESTRATION). Cette coquille accueille le dérouleur et ses panneaux (M4-09+).

## Objectif
Route `/batches/:id/day` (écran plein cadre tablette) chargeant plan + état via `GET /day` (M4-04), avec service worker prêt pour l'offline et **indicateur de connexion**.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/day/` (route, layout, hook `useDaySession`), `dayApi` dans `lib/api.ts`, enregistrement/extension du service worker (PWA posée en M0-08).
- Hors périmètre explicite : dérouleur/étapes (M4-09), timers (M4-10), file offline (M4-14).

## Spécification
- **Layout atelier** : en-tête batch (n°, recette figée lue du snapshot, phase courante lisible), zone d'étape centrale, cibles ≥ 48 px, thème sombre par défaut. Si **aucune** session → bouton « Démarrer le Jour J » (`POST /day/start`) ; sinon rendu de l'état.
- `useDaySession(batchId)` : TanStack Query sur `GET /day` (clé `['day', batchId]`) ; `now` client pour l'affichage des timings ; indicateur **en ligne / hors-ligne** (`navigator.onLine` + events `online`/`offline`).
- Service worker : mise en cache de l'**app-shell** pour ouvrir l'écran hors-ligne. Accessibilité tactile, pas de DnD.

## Definition of Done
- [ ] Tests composant : rendu **sans** session → bouton « Démarrer » ; rendu **avec** session → en-tête + phase ; bascule de l'indicateur hors-ligne
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : ouvrir `/batches/:id/day` affiche l'écran atelier et permet de démarrer une session

## Dépendances
Bloqué par : {{M4-04}} — Bloque : {{M4-09}}, {{M4-10}}, {{M4-11}}, {{M4-12}}, {{M4-13}}, {{M4-14}}
