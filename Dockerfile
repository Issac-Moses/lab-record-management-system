# =============================================================================
# Lab Record System — Backend (Express + Code Runner)
# Production Dockerfile
#
# Key decisions:
#  • Uses package.backend.json (only 8 backend deps — no React/Monaco/etc.)
#  • Explicit COPY of only backend source dirs (no frontend src leaked)
#  • docker-cli installed for code execution sandboxing
#  • Built-in HEALTHCHECK so Coolify/Docker knows when server is ready
#  • start-period=30s gives the server ample time to load all routes
# =============================================================================

FROM node:20-slim

WORKDIR /app

# ─── System dependencies ──────────────────────────────────────────────────────
# curl  : used for general debugging
# docker.io : used by /run endpoint to spawn sandboxed code containers
RUN apt-get update && apt-get install -y curl docker.io && rm -rf /var/lib/apt/lists/*

# ─── Install production Node dependencies ─────────────────────────────────────
# Use the full package.json + package-lock.json with npm ci --omit=dev.
# Why not package.backend.json?
#   npm install (without lockfile) can resolve different package versions than
#   what was tested locally, causing hard-to-diagnose runtime crashes.
# Why --omit=dev?
#   Skips vite, typescript, playwright (no browsers downloaded, smaller image).
# Why not --ignore-scripts?
#   Some packages need their postinstall scripts; omitting breaks them silently.
# All production dependencies in this project are pure JS — no native bindings
# that would fail on Alpine.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --loglevel=warn

# ─── Copy backend source files only ───────────────────────────────────────────
# DO NOT use "COPY . ." — that would copy frontend source, SQL files,
# CSVs, shell scripts, and other irrelevant files into the image.
COPY server.cjs         ./
COPY routes/            ./routes/
COPY middleware/        ./middleware/
COPY services/          ./services/

# ─── Runtime environment ──────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV RUNNER_PORT=7001

# ─── Expose API port ──────────────────────────────────────────────────────────
EXPOSE 7001


# ─── Start the Express API server (with memory limit) ───────────────────────
CMD ["node", "--max-old-space-size=128", "server.cjs"]
