# syntax=docker/dockerfile:1
# Self-host image cho VPS (deploy/vps) — pattern giống didauday.
# App không có NEXT_PUBLIC_* nên không cần build arg; mọi env là runtime
# qua deploy/vps/.env (compose env_file).

FROM node:22-slim AS base
# openssl: Prisma engine detect libssl lúc generate/runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm@11.20.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# postinstall `prisma generate` cần schema sẵn
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://u:p@127.0.0.1:5432/x
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# .prisma/client + query engine đã được trace sẵn trong standalone
# (.pnpm/@prisma+client@*/node_modules/.prisma) — không cần copy tay.
EXPOSE 3000
CMD ["node", "server.js"]
