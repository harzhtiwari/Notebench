# Multi-stage production container build
# Fastify (apps/server) is the sole execution entrypoint serving static SPA (apps/web/out)
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install build essentials for native modules (better-sqlite3) and python3 + uv
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Astral uv for python dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install pnpm
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate

# Copy monorepo manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsdown.config.ts tsconfig*.json ./
COPY packages/ packages/
COPY apps/ apps/
COPY tools/ tools/

# Install dependencies and sync python virtualenv
RUN pnpm install --frozen-lockfile || pnpm install
RUN cd tools/doc-tools && uv sync --frozen || uv sync

# Build all packages, static SPA (apps/web/out), and Fastify daemon (apps/server/dist)
RUN pnpm build

# Production runtime image
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NOTEBENCH_DATA_DIR=/app/.notebook
ENV DO_NOT_TRACK=1
ENV NOTEBENCH_TELEMETRY_DISABLED=1

# Install runtime Python 3, uv, and FFmpeg for audio overview stitching
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy built application, static UI assets, and python worker environment
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/web/out ./apps/server/public
COPY --from=builder /app/tools/doc-tools ./tools/doc-tools

# Ensure persistent directories exist (Two-Folder Taxonomy)
RUN mkdir -p /app/.notebook/state /app/.notebook/uploads /app/.notebook/artifacts /app/.notebook/vault /app/.tmp

EXPOSE 3000

# Fastify is the composition root and single entrypoint
CMD ["node", "apps/server/dist/index.js"]
