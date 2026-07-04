# syntax=docker/dockerfile:1

# ── Base : Node 22 slim + pnpm (via corepack) ─────────────────────────────
FROM node:22-slim AS base
# openssl : requis par le moteur de requêtes Prisma (absent de node:22-slim).
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ── Build : installe tout et compile le monorepo ──────────────────────────
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm build

# ── Runtime : image qui lance l'API ───────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# On copie le workspace construit tel quel : ses node_modules contiennent le
# client Prisma généré (postinstall) et le binaire natif @node-rs/argon2. NB :
# `pnpm deploy --prod` ne préserve pas le client Prisma généré (généré dans le
# virtual store) → allègement d'image via output custom du generator à traiter
# en suivi.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# Le serveur Fastify (config, /health, auth) démarre ici.
CMD ["node", "apps/api/dist/index.js"]
