#!/usr/bin/env bash
# The demo's screens on the core: a throwaway local Postgres with the core, the brandbase pack
# (published, tested, migrated, live) and the demo's data, then the core on :3013. Run web-next
# beside it with NEXT_PUBLIC_CORE_URL=http://localhost:3013 and sign in as admin@local.
#
# `seed.ts` loads the demo's data into the migrated database: it needs only DATABASE_URL and runs
# no migrations of its own.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to a throwaway local Postgres}"
ROOT=$(git rev-parse --show-toplevel)
PORT=${PORT:-3013}
core() { (cd "$ROOT/packages/core" && pnpm -s exec tsx src/cli.ts "$@"); }
# The core's two logins on this throwaway database (core setup-login, setup-migrator): the server
# refuses the installer's login, and a pack's migrations run from their own.
login_url() {
  node -e 'const u = new URL(process.argv[1]); u.username = process.argv[2]; u.password = process.argv[3]; process.stdout.write(u.toString())' "$DATABASE_URL" "$1" "$2"
}
logins() {
  local server_pw migrator_pw
  server_pw=$(openssl rand -hex 24)
  migrator_pw=$(openssl rand -hex 24)
  CORE_LOGIN_PASSWORD=$server_pw core setup-login core_server >/dev/null
  CORE_LOGIN_PASSWORD=$migrator_pw core setup-migrator core_migrator >/dev/null
  SERVER_URL=$(login_url core_server "$server_pw")
  export MIGRATOR_DATABASE_URL=$(login_url core_migrator "$migrator_pw")
}
export CORE_TOKEN=owner # the dev sign-in: the token is the user id
VERSION=$(node -p "require('$ROOT/packs/brandbase/manifest.json').version")

core migrate
logins
core principal owner
core publish "$ROOT/packs/brandbase"
core test brandbase "$VERSION"
core migrate brandbase "$VERSION"
(cd "$ROOT/packs/brandbase" && SEED_ADMIN=admin@local pnpm -s exec tsx demo/seed.ts)
core promote brandbase "$VERSION"
core principal admin@local
core loadout admin@local brandbase all

cd "$ROOT/packages/core"
DATABASE_URL=$SERVER_URL CORS_ALLOWED_ORIGINS=http://localhost:3002 PORT=$PORT exec pnpm -s exec tsx src/main.ts
