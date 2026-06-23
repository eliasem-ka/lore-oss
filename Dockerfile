# ── Stage 1: build React client ──────────────────────────────────────────────
FROM node:22-alpine AS client-build
WORKDIR /build
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
# vite outDir is "../server/public" (relative to client/) → /build/server/public
RUN cd client && npm run build

# ── Stage 2: compile TypeScript server ───────────────────────────────────────
# Debian (glibc) so onnxruntime-node native binaries install correctly (musl/alpine fails).
FROM node:22-slim AS server-build
WORKDIR /build
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ── Stage 3: runtime image ────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

# Production dependencies only
COPY server/package*.json ./
RUN npm ci --omit=dev

# Pre-download the embedding model into the image so the container runs offline
# and the first request doesn't pay the model-fetch cost. Placed right after deps
# (before app code) so editing server/client source does NOT re-trigger the
# download — this layer only invalidates when deps or the model id change.
ENV HF_HOME=/app/.cache/huggingface
ENV EMBEDDING_MODEL=Xenova/multilingual-e5-small
RUN node -e "import('@huggingface/transformers').then(async ({pipeline})=>{await pipeline('feature-extraction', process.env.EMBEDDING_MODEL); console.log('model cached');})"

# Compiled server (changes often → kept below the model layer)
COPY --from=server-build /build/dist ./dist

# Built React SPA (served as static files by Express)
COPY --from=client-build /build/server/public ./public

# Migration SQL files (read by drizzle-orm/migrator at startup)
COPY server/migrations ./migrations

EXPOSE 3000

CMD ["node", "dist/index.js"]
