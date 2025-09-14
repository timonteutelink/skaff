FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies with bun
FROM base AS deps
COPY package.json bun.lock* ./
RUN mkdir -p apps/web apps/cli packages/typescript-config packages/eslint-config packages/tailwind-config
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/tailwind-config/package.json ./packages/tailwind-config/package.json
RUN bun install --no-save --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock* ./
COPY apps/web ./apps/web
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config ./packages/eslint-config
COPY packages/tailwind-config ./packages/tailwind-config

RUN ln -s /app/node_modules apps/web/node_modules

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKAFF_CACHE_PATH=/app/.cache/skaff
ENV SKAFF_CONFIG_PATH=/app/.config/skaff
ENV NPM_PATH="/usr/local/bin/bun"

RUN cd apps/web && bun run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1\
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    PROJECT_SEARCH_PATHS="/projects" \
    SKAFF_CACHE_PATH=/app/.cache/skaff \
    SKAFF_CONFIG_PATH=/app/.config/skaff \
    NPM_PATH="/usr/local/bin/bun"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

RUN chown -R nextjs:nodejs /app

USER nextjs

RUN mkdir -p /app/.cache/skaff
RUN mkdir -p /app/.config/skaff

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["bun", "./server.js"]
