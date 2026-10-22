# syntax=docker/dockerfile:1.7
#
# The server, from the repo root:  docker build -f packages/core/Dockerfile .
# The core with the brands' accounts beside it (packages/connect, `src/brandbase/host.ts`), which
# brings the core in as a dependency. No build step: the source runs under tsx (a production
# dependency). Packs are not in the image; a person publishes, tests and promotes a version with
# the core's command line (`node_modules/@brandfactory/core/src/cli.ts`).

# Node 24, as .nvmrc and CI: the text migration is generated from this Node's Unicode tables,
# and supabase-js needs the native WebSocket that Node 20 lacks.
ARG NODE_VERSION=24.13.0

FROM node:${NODE_VERSION}-alpine AS builder
# The pnpm the repo pins (package.json); corepack in this Node has an outdated signing key.
RUN npm install -g pnpm@10.28.2
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/web-next/package.json packages/web-next/package.json
COPY packages/connect/package.json packages/connect/package.json
COPY packs/brandbase/package.json packs/brandbase/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY packages/core packages/core
COPY packages/connect packages/connect
# A standalone tree with the production dependencies copied in, the core among them; --legacy is
# what pnpm 10 needs for this without workspace-wide injection.
RUN pnpm --filter=@brandfactory/connect deploy --prod --legacy /out

FROM node:${NODE_VERSION}-alpine AS runtime
# tini passes SIGTERM on, so the core closes its pool before it exits.
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /out /app
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/tsx", "src/brandbase/host.ts"]
