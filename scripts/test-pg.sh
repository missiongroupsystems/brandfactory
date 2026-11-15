#!/usr/bin/env bash
# The core's tests on a real Postgres, in a cloud session or any Linux box with Postgres 16
# installed (the cloud image has it). Starts the local server if it is down, makes a throwaway
# login and database once, then runs the core's tests with CORE_TEST_PG_URL set, so the tests that
# PGlite skips (packages/core/README.md) run too. Extra arguments go to vitest.
#
#   scripts/test-pg.sh                          # the core's tests
#   scripts/test-pg.sh src/postgres.test.ts     # one file
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
# The login is `postgres`, as packages/core/README.md has it: one test names the installer.
URL=postgres://postgres:coretest@localhost:5432/coretest
if ! pg_isready -q -h localhost -p 5432; then
  service postgresql start >/dev/null
  for _ in $(seq 1 20); do pg_isready -q -h localhost -p 5432 && break; sleep 0.5; done
fi
su postgres -c "psql -qc \"alter role postgres password 'coretest'\""
su postgres -c "psql -qtAc \"select 1 from pg_database where datname = 'coretest'\"" | grep -q 1 ||
  su postgres -c "createdb coretest"
cd "$ROOT"
CORE_TEST_PG_URL=$URL pnpm vitest run --project @brandfactory/core "$@"
