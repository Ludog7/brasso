# syntax=docker/dockerfile:1

# ── Base : Node 22 slim + pnpm (via corepack) ─────────────────────────────
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ── Build : installe tout, compile le monorepo, prépare un bundle prod ─────
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm build
# Bundle autonome de l'API : dist + dépendances de prod uniquement.
# --legacy : pnpm 10 exige sinon inject-workspace-packages=true, qu'on ne
# veut pas imposer au monorepo juste pour le packaging Docker.
RUN pnpm --filter=@brasso/api deploy --legacy --prod /prod/api

# ── Runtime : image minimale qui lance l'API ──────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/api ./
USER node
EXPOSE 3000
# Le serveur Fastify (config, error handler, /health) est branché en M0-05 ;
# le placeholder actuel se contente d'exporter une constante.
CMD ["node", "dist/index.js"]
