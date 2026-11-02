#!/usr/bin/env bash
# The owner's upgrade of brandbase-db (Fly) to the core with no superuser: steps 3 to 5 of "The
# owner's steps for Fly" in docs/executing/core-no-superuser-plan.md, which says what goes around
# them (the backup, the build, the deploy, the rollback). `postgres.test.ts` runs steps 3 and 5,
# in this order, on a Postgres made the old way ("upgrades a core made the old way").
#
# Run from the repo root, with `fly proxy 15432:5432 -a brandbase-db` open in another terminal.
# Passwords come from the macOS Keychain (service brandbase-db, account = the role) and are never
# printed. OLD_LOGIN is the login the server uses today (it owns the core; not postgres).
#
#   OLD_LOGIN=<role> packages/core/scripts/fly-no-superuser.sh prepare   # step 3: safe
#   packages/core/scripts/fly-no-superuser.sh check                       # the start check, as core_server
#   OLD_LOGIN=<role> packages/core/scripts/fly-no-superuser.sh migrate   # step 5: cannot be undone
#   packages/core/scripts/fly-no-superuser.sh secret <host> [role] [port] # step 6: a URL, to the clipboard
#     (127.0.0.1 core_migrator 15432: MIGRATOR_DATABASE_URL through the proxy, for `migrate <pack>`)
set -euo pipefail

DB=brandbase
pw() { security find-generic-password -s brandbase-db -a "$1" -w; }
# A password percent-encoded for a URL, read on stdin so it is in no command's arguments.
encoded() { node -e 'process.stdout.write(encodeURIComponent(require("fs").readFileSync(0, "utf8")))'; }
url_for() {
  local secret
  secret="$(pw "$1")" # a failed read stops the script here (set -e)
  printf 'postgres://%s:%s@%s:%s/%s' "$1" "$(printf '%s' "$secret" | encoded)" "$2" "$3" "$DB"
}
core() { DATABASE_URL="$1" pnpm -F @brandfactory/core exec tsx src/cli.ts "${@:2}"; }
# psql as a role through the proxy, its password in the environment, not in the arguments.
psql_as() {
  local secret
  secret="$(pw "$1")"
  PGPASSWORD="$secret" psql -h 127.0.0.1 -p 15432 -U "$1" -d "$DB" -v ON_ERROR_STOP=1 "${@:2}"
}

old_login() {
  : "${OLD_LOGIN:?the login the server uses today}"
  if [ "$OLD_LOGIN" = postgres ]; then
    echo "OLD_LOGIN is the login the server uses today, not postgres: as postgres the core's" >&2
    echo "functions would run with a superuser's rights" >&2
    exit 1
  fi
}

case "${1:-}" in
  prepare)
    old_login
    superuser="$(url_for postgres 127.0.0.1 15432)"
    # pack_server and pack_recorder (core 0013, 0014), as the superuser: the old login may not
    # create roles.
    psql_as postgres -qc \
      "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'pack_server') then
         create role pack_server nologin; end if;
         if not exists (select 1 from pg_roles where rolname = 'pack_recorder') then
         create role pack_recorder nologin; end if; end \$\$"
    # The new logins' passwords, made here and kept in the Keychain only: the server's, and the
    # one a pack's migrations run from.
    for login in core_server core_migrator; do
      if ! security find-generic-password -s brandbase-db -a "$login" >/dev/null 2>&1; then
        printf 'add-generic-password -s brandbase-db -a %s -w %s\n' "$login" "$(openssl rand -hex 24)" | security -i
      fi
    done
    login_password="$(pw core_server)"
    CORE_LOGIN_PASSWORD="$login_password" core "$superuser" setup-login core_server
    login_password="$(pw core_migrator)"
    CORE_LOGIN_PASSWORD="$login_password" core "$superuser" setup-migrator core_migrator
    echo "prepared: pack_server, pack_recorder, core_server and core_migrator exist; nothing changed for the running site"
    ;;
  check)
    core "$(url_for core_server 127.0.0.1 15432)" check-login
    ;;
  secret)
    host="${2:?the database host the app uses on the Fly private network}"
    role="${3:-core_server}"
    url_for "$role" "$host" "${4:-5432}" | pbcopy
    echo "copied ${role}'s URL: fly secrets set --stage DATABASE_URL=\"\$(pbpaste)\" -a brandfactory; then pbcopy </dev/null"
    ;;
  migrate)
    old_login
    target="$(url_for "$OLD_LOGIN" 127.0.0.1 15432)"
    if [ "$(psql_as "$OLD_LOGIN" -tAc 'select rolsuper from pg_roles where rolname = current_user')" != f ]; then
      echo "$OLD_LOGIN is a superuser: the core's functions would run with its rights" >&2
      exit 1
    fi
    echo "Database: $(psql_as "$OLD_LOGIN" -tAc "select current_database() || ' on ' || coalesce(inet_server_addr()::text, 'a socket')") (through the proxy on 15432)"
    read -r -p "Apply core 0011 to 0013 as ${OLD_LOGIN}? Only the backup undoes it; deploy at once after. [yes/no] " ok
    [ "$ok" = yes ] || { echo "stopped"; exit 1; }
    core "$target" migrate
    echo "migrated: deploy the new image now (step 6), the same minute"
    ;;
  *)
    sed -n '2,15p' "$0"
    exit 1
    ;;
esac
