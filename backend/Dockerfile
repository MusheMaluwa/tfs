# Production image. Ships `pg` only — no embedded database — so it
# REQUIRES DATABASE_URL to be set (docker-compose.yml sets it). Starting
# without one fails fast with a message saying so rather than an opaque
# module-resolution error; see src/db.js.
#
# Authored and reviewed for correctness but not built here (no Docker
# daemon in the environment this was produced in) — verify with
# `docker build ./backend` before relying on it.

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
# --omit=dev drops @electric-sql/pglite: a real deployment points at a
# real server, and leaving out the WASM engine keeps the image small.
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
USER node
CMD ["node", "src/server.js"]
