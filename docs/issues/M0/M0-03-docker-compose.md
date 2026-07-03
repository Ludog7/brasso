---
labels: infra, feature, P0
milestone: M0 — Socle
---
# M0-03 — Docker Compose (app + PostgreSQL 16 + Caddy) + Dockerfile + Caddyfile

## Contexte
ADR-02 (PostgreSQL 16, service Docker dédié) et §1/§2. La cible est un déploiement selfhosted par Docker Compose avec Caddy en reverse proxy/TLS. Le critère de démo de M0 est `docker compose up` → login fonctionnel.

## Objectif
`docker compose -f docker-compose.dev.yml up` démarre postgres + api + web accessibles localement ; la prod (`docker-compose.yml`) ajoute Caddy avec TLS.

## Périmètre technique
- Fichiers/dossiers concernés :
  - `docker-compose.yml` (prod : app + postgres + caddy), `docker-compose.dev.yml` (dev : postgres + hot-reload api/web, ports exposés)
  - `Dockerfile` multi-stage (build monorepo → runtime Node 22 slim)
  - `Caddyfile` (reverse proxy vers api/web, TLS auto)
  - `.env.example` (POSTGRES_*, DATABASE_URL, SESSION_SECRET, etc.)
- Hors périmètre explicite : contenu applicatif (routes, front) ; secrets réels.

## Spécification
- PostgreSQL 16, volume nommé persistant, healthcheck.
- Réseau interne ; seuls les ports nécessaires exposés en dev.
- `DATABASE_URL` construite depuis les variables ; secrets uniquement via env (jamais commités — cf. sécurité §6).
- Dockerfile multi-stage : stage build (pnpm install + build), stage runtime minimal.
- Caddy : TLS automatique, en-têtes de sécurité de base, proxy `/api/*` → api, reste → web.
- Compatibilité Node 22 (§1).

## Definition of Done
- [ ] `docker compose -f docker-compose.dev.yml up` démarre postgres + api healthcheck OK
- [ ] `.env.example` documenté, aucun secret réel commité
- [ ] Dockerfile build reproductible
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : postgres accepte les connexions ; l'API répond sur `/health`

## Dépendances
Bloqué par : {{M0-01}} — Bloque : {{M0-04}}, {{M0-05}}
