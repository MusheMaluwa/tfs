# NOTE: written for the recommended production stack (Node + Express +
# PostgreSQL per the Development Stack doc), NOT for the zero-dependency
# code as delivered — see backend/README.md "Moving to the recommended
# production stack" first. This file was authored and reviewed for
# correctness but could not be built/run here (no Docker daemon in the
# environment this was produced in) — verify with `docker build .`
# before relying on it.

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
USER node
CMD ["node", "src/server.js"]
