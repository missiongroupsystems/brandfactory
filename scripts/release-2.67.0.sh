#!/usr/bin/env bash
# The 2.67.0 release on production, from the owner's Mac (docs/completions/post-options-plan.md,
# "Release"). Run it in the repository root, on main, after the merge:
#
#   OWNER_EMAIL=<your sign-in email> scripts/release-2.67.0.sh
#
# It needs, as for the last releases:
#   - the Keychain items of service `brandbase-supabase-db`, accounts `core_login` and
#     `core_migrator` (docs/executing/supabase-move-plan.md);
#   - SUPABASE_JWKS_URL, SUPABASE_URL and SUPABASE_ANON_KEY of the sign-in project (Passport), in
#     the shell, for `core login`;
#   - `fly`, signed in to the app `brandfactory`.
# Your sign-in password is asked for once and never printed. Nothing is printed that holds a secret.
set -euo pipefail
: "${OWNER_EMAIL:?set OWNER_EMAIL to your sign-in email}"
: "${SUPABASE_JWKS_URL:?set SUPABASE_JWKS_URL (the sign-in project)}"
: "${SUPABASE_URL:?set SUPABASE_URL (the sign-in project)}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY (the sign-in project)}"
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "check out main first"; exit 1; }
git pull --ff-only -q
VERSION=$(node -p "require('./packs/brandbase/manifest.json').version")
[ "$VERSION" = 1.16.0 ] || { echo "the pack is $VERSION, not 1.16.0"; exit 1; }

# The session pooler (IPv4), as the CLI reaches Supabase from a network without IPv6.
REF=qcxikcauwonrbftqiitp
CA="$ROOT/packages/core/supabase-ca.crt"
url() {
  local pw
  pw=$(security find-generic-password -s brandbase-supabase-db -a "$1" -w)
  node -e 'const [u,p,r,ca]=process.argv.slice(1);process.stdout.write(`postgres://${u}.${r}:${encodeURIComponent(p)}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=${ca}`)' "$1" "$pw" "$REF" "$CA"
}
export DATABASE_URL MIGRATOR_DATABASE_URL
DATABASE_URL=$(url core_login)
MIGRATOR_DATABASE_URL=$(url core_migrator)
export AUTH_PROVIDER=supabase CORE_ENVIRONMENT=production
core() { (cd "$ROOT/packages/core" && pnpm -s exec tsx src/cli.ts "$@"); }

echo "1. Sign in as $OWNER_EMAIL (the promote acts for a person)"
read -rs -p "Password: " CORE_PASSWORD
echo
CORE_PASSWORD=$CORE_PASSWORD core login "$OWNER_EMAIL"
unset CORE_PASSWORD

echo "2. The pack: publish, test, migrate (no migration in 1.16.0), promote"
core publish packs/brandbase
core test brandbase "$VERSION"
core migrate brandbase "$VERSION"
core promote brandbase "$VERSION"

echo "3. Loadouts: each person who holds brandbase's moves gets the new internal move post.ig_media"
# Added to the lists people already have, never a list widened to every move: an agent keeps its
# own list, and a person with a short list keeps it.
(cd "$ROOT/packages/core" && node -e '
const { Client } = require("pg")
const c = new Client({ connectionString: process.env.DATABASE_URL })
c.connect()
  .then(() => c.query(`update packs.loadouts l set ops = array_append(l.ops, $1)
     from packs.principals p
     where p.id = l.principal and p.agent_of is null and l.pack = $2
       and $3 = any (l.ops) and not ($1 = any (l.ops))`, ["post.ig_media", "brandbase", "post.list"]))
  .then((r) => console.log(`   ${r.rowCount} loadouts updated`))
  .finally(() => c.end())
')

echo "4. Which accounts post through the Meta app (via = meta) and which through Make"
(cd "$ROOT/packages/core" && node -e '
const { Client } = require("pg")
const c = new Client({ connectionString: process.env.DATABASE_URL })
c.connect()
  .then(() => c.query(`select brand_id, platform, coalesce(details ->> $1, $2) as via
     from brandbase.accounts where platform in ($3, $4) order by 1, 2`, ["via", "make", "instagram", "facebook"]))
  .then((r) =>
    r.rows.length > 0
      ? console.table(r.rows)
      : console.log("   no rows readable from this login: check Connections in the app instead"))
  .finally(() => c.end())
')

echo "5. The server"
fly deploy -a brandfactory
curl -fsS https://brandfactory.fly.dev/health && echo

echo "Done. Post one test with a collaborator, a tag, a first comment and a crop, then check Instagram."
