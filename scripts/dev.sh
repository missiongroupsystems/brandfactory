#!/usr/bin/env bash
# Dev entrypoint — boots the Hono server and both frontends in parallel.
#
# The server serves the API + realtime WS on :3001. Vite boots on :5173 with
# a proxy (`/api`, `/rt` and `/blobs` → :3001) so the browser sees a single
# origin and no CORS setup is needed in dev.
#
# Next boots on :3000 and is the frontend to work in. It talks to nothing —
# every screen is fixture-backed (`packages/web-next/src/lib/api/mock.ts`), so
# it needs neither the server nor Postgres and is fine to run alone:
#
#   pnpm -F @brandfactory/web-next dev
#
# :5173 is the previous Vite app. It is unchanged, still needs the server, and
# stays until its features have moved to :3000.
#
# `/blobs` joined that list in 2E. It was missing from 0.7.4, which made every
# browser *upload* fail on a CORS preflight while every *read* kept working —
# an `<img src>` is not CORS-gated. It also requires `BLOB_PUBLIC_BASE_URL` to
# be relative; see `.env.example`.
#
# Assumes Postgres is already running. Start it via
# `docker compose -f docker/compose.yaml up -d` and apply migrations with
# `pnpm -F @brandfactory/db db:migrate` before the first boot.

set -euo pipefail

cd "$(dirname "$0")/.."

server_pid=
web_pid=
next_pid=

cleanup() {
  trap - INT TERM EXIT
  [[ -n "${server_pid}" ]] && kill "${server_pid}" 2>/dev/null || true
  [[ -n "${web_pid}" ]] && kill "${web_pid}" 2>/dev/null || true
  [[ -n "${next_pid}" ]] && kill "${next_pid}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "→ server: http://localhost:3001"
pnpm -F @brandfactory/server dev &
server_pid=$!

echo "→ web:    http://localhost:5173  (previous Vite app)"
pnpm -F @brandfactory/web dev &
web_pid=$!

echo "→ next:   http://localhost:3000  (BrandFactory — start here)"
pnpm -F @brandfactory/web-next dev &
next_pid=$!

# Exit as soon as any process dies — matches "Ctrl-C kills everything".
# `wait -n` is the clean path (bash 4.3+); macOS ships with bash 3.2, so
# fall back to polling every PID. `cleanup` above then tears down the peers.
if wait -n 2>/dev/null; then
  :
else
  while kill -0 "${server_pid}" 2>/dev/null && kill -0 "${web_pid}" 2>/dev/null &&
    kill -0 "${next_pid}" 2>/dev/null; do
    sleep 1
  done
fi
