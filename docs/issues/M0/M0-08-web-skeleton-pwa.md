---
labels: web, feature, P0
milestone: M0 — Socle
---
# M0-08 — Squelette front React 18 + Vite + Tailwind 4 + shadcn/ui + PWA + login

## Contexte
ADR-05 (React 18 + Vite, PWA, cible tablette atelier, Tailwind + shadcn/ui, gros boutons, mode sombre par défaut) et exigences UI atelier §6. Fournit la coquille front et l'écran de login relié à l'auth (M0-06).

## Objectif
`pnpm --filter @brasso/web dev` sert une PWA installable, en mode sombre par défaut, avec un écran de login fonctionnel qui authentifie contre l'API et affiche l'utilisateur courant.

## Périmètre technique
- Fichiers/dossiers concernés :
  - `apps/web/` : Vite + React 18 + TypeScript, `vite-plugin-pwa` (Workbox)
  - Tailwind CSS 4 + shadcn/ui, thème sombre par défaut, cibles tactiles ≥ 48 px
  - `src/routes/` (React Router), écran `login`, layout applicatif
  - TanStack Query pour l'appel `/auth/*` ; store Zustand minimal (session UI)
  - `src/ui/` composants shadcn adaptés « atelier »
- Hors périmètre explicite : écrans métier (recettes, batchs…), offline sync (M4).

## Spécification
- PWA : manifest, service worker, installable ; base pour l'offline V2 (ADR-08).
- Mode sombre par défaut, contraste AA minimum, boutons larges (≥ 48 px), zéro drag-and-drop (§6).
- Login : formulaire → `POST /auth/login` (cookie), redirection, `GET /auth/me`, logout.
- Gestion d'erreur et état de chargement soignés (tablette, wifi instable).

## Definition of Done
- [ ] `pnpm --filter @brasso/web dev` sert l'app, PWA installable
- [ ] Mode sombre par défaut, cibles ≥ 48 px
- [ ] Login e2e léger contre l'API (cookie de session)
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : se connecter depuis l'UI, voir son identité, se déconnecter

## Dépendances
Bloqué par : {{M0-01}}, {{M0-06}} — Bloque : —
