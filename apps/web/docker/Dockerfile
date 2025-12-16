# syntax=docker/dockerfile:1.7

# =============================================================================
# Skaff Web Interface - Docker Build
# =============================================================================
#
# This Dockerfile builds the Skaff web interface with optional plugin support.
#
# BUILD ARGUMENTS:
#   SKAFF_PLUGINS     - Space-separated list of plugin packages to install
#                       Example: "@skaff/plugin-docker@1.0.0 @myorg/my-plugin"
#   NPM_TOKEN         - Optional npm token for private registries
#   NPM_REGISTRY      - Optional custom npm registry URL
#
# USAGE:
#   # Build without plugins
#   docker build -t skaff-web .
#
#   # Build with plugins
#   docker build \
#     --build-arg SKAFF_PLUGINS="@skaff/plugin-greeter@1.0.0" \
#     -t skaff-web .
#
#   # Build with private registry
#   docker build \
#     --build-arg SKAFF_PLUGINS="@myorg/private-plugin@1.0.0" \
#     --build-arg NPM_TOKEN="your-token" \
#     --build-arg NPM_REGISTRY="https://npm.myorg.com" \
#     -t skaff-web .
#
# =============================================================================

FROM oven/bun:latest AS base

WORKDIR /app

# =============================================================================
# Stage 1: Install dependencies
# =============================================================================
FROM base AS deps

# Build arguments for plugin installation
ARG SKAFF_PLUGINS=""
ARG NPM_TOKEN=""
ARG NPM_REGISTRY=""

# Configure npm/bun for private registries if token provided
RUN if [ -n "$NPM_TOKEN" ] && [ -n "$NPM_REGISTRY" ]; then \
      echo "//$(echo $NPM_REGISTRY | sed 's|https://||'):_authToken=$NPM_TOKEN" >> ~/.bunfig.toml; \
    elif [ -n "$NPM_TOKEN" ]; then \
      echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> ~/.bunfig.toml; \
    fi

# Copy package files for dependency installation
COPY package.json bun.lock* ./
RUN mkdir -p apps/web apps/cli packages/typescript-config packages/eslint-config packages/tailwind-config
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/tailwind-config/package.json ./packages/tailwind-config/package.json

# Install base dependencies
RUN --mount=type=cache,target=/root/.cache/bun \
    bun install --no-save

WORKDIR /app/apps/web

RUN --mount=type=cache,target=/root/.cache/bun \
    bun install --no-save

# Install plugins if specified
# SECURITY: Plugins are installed at build time only
RUN if [ -n "$SKAFF_PLUGINS" ]; then \
      echo "Installing Skaff plugins: $SKAFF_PLUGINS"; \
      for plugin in $SKAFF_PLUGINS; do \
        echo "  Installing: $plugin"; \
        bun add "$plugin" --no-save || exit 1; \
      done; \
      echo "Plugin installation complete"; \
    else \
      echo "No plugins specified (SKAFF_PLUGINS is empty)"; \
    fi

# =============================================================================
# Stage 2: Build the application
# =============================================================================
FROM base AS builder

# Pass plugin list to build stage for registry generation
ARG SKAFF_PLUGINS=""
ENV SKAFF_PLUGINS=$SKAFF_PLUGINS

WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/web ./apps/web
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config ./packages/eslint-config
COPY packages/tailwind-config ./packages/tailwind-config

COPY --from=deps /app/node_modules ./node_modules
# Copy web app node_modules which includes installed plugins
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKAFF_CACHE_PATH=/app/.cache/skaff
ENV SKAFF_CONFIG_PATH=/app/.config/skaff
ENV NPM_PATH="/usr/local/bin/bun"

WORKDIR /app/apps/web

ENV NEXT_CACHE_DIR=/app/apps/web/.next/cache

# Generate plugin registry and build
# The generate:plugins script scans node_modules for installed plugins
# and creates a static TypeScript file with imports
RUN --mount=type=cache,target=/app/apps/web/.next/cache \
    bun run build

# =============================================================================
# Stage 3: Production image
# =============================================================================
FROM base AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y gosu git rsync && rm -rf /var/lib/apt/lists/*

# Store installed plugins info for runtime inspection
ARG SKAFF_PLUGINS=""
ENV SKAFF_INSTALLED_PLUGINS=$SKAFF_PLUGINS

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

COPY --from=deps --chown=nextjs:nodejs /app/node_modules/typescript ./node_modules/typescript

COPY apps/web/docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

RUN mkdir -p /app/.cache/skaff
RUN mkdir -p /app/.config/skaff

RUN chown -R nextjs:nodejs /app
RUN git config --system user.name "Skaff Diff Bot" \
    && git config --system user.email "skaff-diff@example.com"

WORKDIR /app/apps/web

EXPOSE 3000

# Labels for plugin information
LABEL org.opencontainers.image.title="Skaff Web Interface"
LABEL org.opencontainers.image.description="Template scaffolding web interface"
LABEL skaff.plugins="${SKAFF_PLUGINS:-none}"

ENTRYPOINT ["/usr/local/bin/entrypoint"]
CMD ["bun", "./server.js"]
