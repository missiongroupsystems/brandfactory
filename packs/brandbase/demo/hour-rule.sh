#!/usr/bin/env bash
# The phase 3 demo (docs/completions/packs-core-plan.md): change "no post before 07:00" to 08:00 in a
# new version, test it, promote it, and see a call refuse 07:30; see a version with a failing test
# refused; move the pointer back and see 07:30 work again. One core server runs throughout.
#
# Needs DATABASE_URL: a throwaway Postgres on this machine (superuser), which this script fills.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to a throwaway local Postgres}"
ROOT=$(git rev-parse --show-toplevel)
PORT=${PORT:-3013}
WORK=$(mktemp -d)
core() { (cd "$ROOT/packages/core" && pnpm -s exec tsx src/cli.ts "$@"); }
say() { printf '\n== %s\n' "$*"; }

# Three versions of the pack, from the one in the repo.
cp -R "$ROOT/packs/brandbase" "$WORK/v100"
cp -R "$ROOT/packs/brandbase" "$WORK/v110"
cp -R "$ROOT/packs/brandbase" "$WORK/v120"
node -e '
const fs = require("fs"), [, work] = process.argv
const edit = (f, fn) => fs.writeFileSync(f, JSON.stringify(fn(JSON.parse(fs.readFileSync(f, "utf8"))), null, 2))
for (const [dir, version] of [["v110", "1.1.0"], ["v120", "1.2.0"]]) {
  edit(`${work}/${dir}/manifest.json`, (m) => ({ ...m, version }))
  edit(`${work}/${dir}/rules/post.not_too_early.json`, (r) => ({
    ...r, sql: r.sql.replace("07:00", "08:00"), message: "a post goes out from 08:00" }))
}
// 1.2.0 carries a case that expects the old hour: its run fails.
edit(`${work}/v120/tests/posts.json`, (t) => ({ ...t, cases: [...t.cases, { name: "takes 07:30", steps: [
  { call: "post.create_draft", input: { brand: "casa", id: "late", format: "reel", hook: "x", day: "2026-10-08", time: "07:30" } }] }] }))
' "$WORK"

say "the core's migrations, and the demo's people"
core migrate
core principal owner
core principal member
export CORE_TOKEN=owner  # the dev sign-in: the token is the user id

say "1.0.0: publish, test, migrate from the tested version, promote"
core publish "$WORK/v100"
core test brandbase 1.0.0
core migrate brandbase 1.0.0
psql -q "$DATABASE_URL" -f "$ROOT/packs/brandbase/tests/fixture.sql"
core promote brandbase 1.0.0
core loadout member brandbase all

say "one core server, started once"
(cd "$ROOT/packages/core" && PORT=$PORT PIN_NOW=2026-10-06T04:00:00Z pnpm -s exec tsx src/main.ts) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$WORK"' EXIT
until curl -sf "http://localhost:$PORT/health" >/dev/null; do sleep 0.5; done
post() {
  curl -s -X POST "http://localhost:$PORT/ops/brandbase/post.create_draft" \
    -H 'authorization: Bearer member' -H 'content-type: application/json' \
    -d "{\"brand\":\"casa\",\"id\":\"$1\",\"format\":\"reel\",\"hook\":\"Breakfast\",\"day\":\"2026-10-08\",\"time\":\"07:30\"}" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.code ? `refused: ${r.code} (${r.message})` : `made ${r.id} at ${r.time}`)})'
}
echo "07:30 on 1.0.0: $(post a1)"

say "1.1.0 (no post before 08:00): publish, test, promote"
core publish "$WORK/v110"
core test brandbase 1.1.0
core promote brandbase 1.1.0
echo "07:30 on 1.1.0: $(post a2)"

say "1.2.0, whose own test fails: publish, test, promote"
core publish "$WORK/v120"
core test brandbase 1.2.0 || true
core promote brandbase 1.2.0 || true

say "back to 1.0.0"
core promote brandbase 1.0.0
echo "07:30 on 1.0.0 again: $(post a3)"
echo "the same server throughout: pid $SERVER, $(kill -0 $SERVER && echo running)"
