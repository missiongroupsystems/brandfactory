# syntax=docker/dockerfile:1.7
#
# Bubbles, from the repo root:  docker build -f packages/bubbles/Dockerfile .
# No build step: the source runs under tsx (a production dependency), as the core's image does.
#
# Debian, not Alpine: DeepSeek's harness runtime is built for glibc 2.28 and needs libstdc++,
# which this Node image already has.

ARG NODE_VERSION=24.13.0

FROM node:${NODE_VERSION}-bookworm-slim AS builder
# The pnpm the repo pins (package.json); corepack in this Node has an outdated signing key.
RUN npm install -g pnpm@10.28.2
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

# The runtime binary, from the wheel the README names, checked against its PyPI digest.
ARG DSH_WHEEL=deepseek_harness_runtime_bin-0.1.5rc1-py3-none-manylinux_2_28_x86_64.whl
ARG DSH_SHA256=ad877237382baff4628969a9ebdbfe38486d971b7987c032d0e29775759b5229
RUN curl -fsSL -o /tmp/dsh.whl \
    "https://files.pythonhosted.org/packages/py3/d/deepseek-harness-runtime-bin/${DSH_WHEEL}" \
  && echo "${DSH_SHA256}  /tmp/dsh.whl" | sha256sum -c - \
  && unzip -q /tmp/dsh.whl 'deepseek_harness_runtime/runtime/*' -d /tmp/dsh \
  && mv /tmp/dsh/deepseek_harness_runtime/runtime /dsh \
  && chmod 0555 /dsh/* \
  && rm -rf /tmp/dsh /tmp/dsh.whl

WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/bubbles/package.json packages/bubbles/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/web-next/package.json packages/web-next/package.json
COPY packages/connect/package.json packages/connect/package.json
COPY packs/brandbase/package.json packs/brandbase/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY packages/bubbles packages/bubbles
RUN pnpm --filter=@brandfactory/bubbles deploy --prod --legacy /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# The pack whose brief Bubbles reads; the code itself knows the pack by name only.
ARG PACK=brandbase
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /out /app
COPY --from=builder /dsh /opt/dsh
COPY packs/${PACK}/bubbles.md /app/brief.md
ENV NODE_ENV=production PORT=3014 HOST=0.0.0.0 \
    DSH_BIN=/opt/dsh/deepseek-harness-sdk-runtime-linux-x64 \
    BUBBLES_PACK=${PACK} BUBBLES_BRIEF=/app/brief.md
# Not root: each runtime gets a fresh home under /tmp.
USER node
EXPOSE 3014
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node_modules/.bin/tsx", "src/main.ts"]
