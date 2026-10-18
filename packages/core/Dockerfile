# syntax=docker/dockerfile:1.7
#
# The core, from the repo root:  docker build -f packages/core/Dockerfile .
# No build step: the source runs under tsx (a production dependency). Packs are not in the image;
# a person publishes, tests and promotes a version with the command line (`src/cli.ts`).

# Node 22: supabase-js needs its native WebSocket, which Node 20 lacks.
ARG NODE_VERSION=22.12.0

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
# A standalone tree with the production dependencies copied in; --legacy is what pnpm 10 needs
# for this without workspace-wide injection.
RUN pnpm --filter=@brandfactory/core deploy --prod --legacy /out

FROM node:${NODE_VERSION}-alpine AS runtime
# tini passes SIGTERM on, so the core closes its pool before it exits.
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /out /app
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/tsx", "src/main.ts"]
