---
labels: api, feature, P0
milestone: M0 — Socle
---
# M0-05 — Squelette API Fastify 5 (plugins, error handler, config, /health)

## Contexte
ADR-04 (Fastify + Zod, REST) et structure §2 (`apps/api/src/{plugins,modules,webhooks}`). Pose l'ossature de l'API sur laquelle auth (M0-06) et RBAC (M0-07) se branchent.

## Objectif
`pnpm --filter @brasso/api dev` démarre un serveur Fastify qui répond `200` sur `/health` et charge sa config validée par Zod.

## Périmètre technique
- Fichiers/dossiers concernés :
  - `apps/api/src/server.ts` (bootstrap Fastify), `apps/api/src/app.ts` (build de l'instance, testable)
  - `apps/api/src/plugins/` : `config.ts` (env validé Zod), `errorHandler.ts` (réponses d'erreur normalisées), `sensible`/`cors`/`helmet` de base
  - `apps/api/src/modules/health/routes.ts`
  - `apps/api/tests/health.test.ts` (Vitest + inject)
- Hors périmètre explicite : auth (M0-06), RBAC (M0-07), modules métier.

## Spécification
- Fastify 5, TypeScript. Validation des entrées par schémas Zod partagés depuis `@brasso/core/schemas` (quand disponibles) ; en attendant, Zod local.
- Config env validée au démarrage (fail-fast si variable manquante) : `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, `RATE_LIMIT_*`.
- Error handler : format d'erreur homogène `{ error: { code, message, details? } }`, pas de fuite de stack en prod.
- `app.ts` séparé de `server.ts` pour permettre les tests par `app.inject`.
- Un module = dossier `{routes,service,repository}.ts` (§2).

## Definition of Done
- [ ] `GET /health` → 200 `{ status: "ok" }`
- [ ] Config invalide → crash explicite au démarrage
- [ ] Test Vitest du /health vert (via inject)
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : serveur démarre en dev et via Docker (M0-03)

## Dépendances
Bloqué par : {{M0-01}}, {{M0-03}}, {{M0-04}} — Bloque : {{M0-06}}, {{M0-07}}
