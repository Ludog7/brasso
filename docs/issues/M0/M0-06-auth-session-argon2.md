---
labels: api, feature, P0
milestone: M0 — Socle
---
# M0-06 — Auth session cookie + Argon2id + rate-limit login

## Contexte
ADR-10 (auth session cookie + RBAC maison, Argon2id, pas de Keycloak/Auth0 en V1) et exigences sécurité §6. Fournit l'authentification sur laquelle le RBAC (M0-07) s'appuie.

## Objectif
Un utilisateur peut se connecter (`POST /auth/login`) et obtenir un cookie de session `httpOnly/secure/sameSite` ; `POST /auth/logout` invalide la session ; `GET /auth/me` renvoie l'utilisateur courant.

## Périmètre technique
- Fichiers/dossiers concernés :
  - `apps/api/src/plugins/auth.ts` (session, hash, décorateur `request.user`)
  - `apps/api/src/modules/auth/{routes,service,repository}.ts`
  - Modèles `User`, `Session` (Prisma) — extension minimale du schéma pour l'auth (le schéma complet membres/rôles arrive en M1-01)
  - `apps/api/tests/auth.test.ts`
- Hors périmètre explicite : matrice RBAC complète (M0-07), fichier membres (M6).

## Spécification
- Hash mot de passe : **Argon2id** (paramètres raisonnables, documentés).
- Session : cookie `httpOnly`, `secure` (prod), `sameSite=lax`, expiration + rotation ; stockage session en DB (table `Session`).
- Rate-limit sur `/auth/login` (ex. via `@fastify/rate-limit`) contre le brute-force (§6).
- Réponses : jamais révéler si c'est le login ou le mot de passe qui est faux.
- `GET /auth/me` → 401 si non authentifié.

## Definition of Done
- [ ] login/logout/me fonctionnels, cookie correctement attribué
- [ ] Argon2id utilisé, aucun mot de passe en clair ni loggué
- [ ] Rate-limit actif sur login (test le vérifie)
- [ ] Tests Vitest verts (succès, mauvais mdp, rate-limit)
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : cycle login → me → logout via curl/inject

## Dépendances
Bloqué par : {{M0-05}} — Bloque : {{M0-07}}
