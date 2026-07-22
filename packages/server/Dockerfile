# syntax=docker/dockerfile:1
# Build context is the repo root — deploy with `fly deploy` from the root,
# or build locally with `docker build -f packages/server/Dockerfile .`.
FROM node:22-slim

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY . .

# The server runs its TypeScript sources directly through tsx (a
# devDependency), so dev deps are needed at runtime (--prod=false). The
# filter installs @brandfactory/server plus its workspace dependencies
# only — web and its React/Vite tree stay out of the image.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod=false --filter '@brandfactory/server...'

ENV NODE_ENV=production
EXPOSE 3001

# WORKDIR matters twice: tsx resolves src/main.ts from here, and the Fly
# release command cd's into node_modules/@brandfactory/db relative to here.
WORKDIR /app/packages/server
CMD ["./node_modules/.bin/tsx", "src/main.ts"]
