# Moving the core's data from Fly to Supabase

Done on 3 Nov 2026 (2.61.2), except phase 4. The server stays on Fly (`brandfactory`, sin); its
database moved from the Fly Postgres app `brandbase-db` to the Supabase project **BrandBase**
(`qcxikcauwonrbftqiitp`, ap-southeast-1), which already held sign-in and file storage. Follows
`docs/executing/core-no-superuser-plan.md` (2.61.1), which made the core safe on a Postgres with no
superuser.

## Why

One service fewer to run: Supabase gives daily backups, a dashboard and upgrades, where
`brandbase-db` was a machine we looked after ourselves. Nobody used the app yet, so the owner chose
to move at once, with no rehearsal and no window.

## What we knew before

- Supabase: Postgres 17.11 (Fly ran 18.6), Micro (1 GB), daily physical backups kept 7 days, no
  point-in-time restore. `pack_admin`, `pack_migrator` and `pack_runtime` already existed there
  (the attempt of 22 Oct), administered by `postgres`.
- The core on Postgres 17: the 490 real-Postgres tests (`postgres.test.ts`, `packs.test.ts`) pass
  on `postgres:17` (17.11).
- `brandbase-db`: 19 MB, four schemas (`packs`, `claims`, `textfn` owned by `core_login`;
  `brandbase` by `pack_migrator`), no default privileges, nothing in `public`, `CREATE` on the
  database for `pack_migrator`.
- From the Fly machine, a connect takes 0.6 ms to `brandbase-db.flycast`, 2.9 ms to Supabase's
  direct host (IPv6) and 8.0 ms to its session pooler (IPv4). The app uses the direct host.
- Supabase signs its Postgres hosts with its own root ("Supabase Root 2021 CA", to 2031), so
  `sslmode=require` fails in node-postgres; `verify-full` with that root passes.

## What was done

1. The passwords of `core_login`, `core_server` and `core_migrator` made in the Keychain (service
   `brandbase-supabase-db`; `postgres`'s there too) and sent to Supabase as SCRAM verifiers.
2. On Supabase, as `postgres`, in one transaction: those three logins, `pack_server` and
   `pack_recorder`, the memberships exactly as on Fly, `CREATE` on the database for
   `pack_migrator`, and `postgres` a member of `core_login` for the restore (taken back after).
3. The app stopped (`fly machine stop`). `pg_dump` 18 of the four schemas (11 MB, plain SQL),
   restored with `psql --single-transaction -v ON_ERROR_STOP=1` through the session pooler: no
   error, 10 s.
4. Checked: all 42 tables have the same rows and the same contents (an md5 of each table's rows,
   sorted under `C` in UTC; before fixing the sort and the time zone, 6 tables hashed differently
   with the same counts); owners, functions, row rules and privileges the same, except seven
   `packs` tables whose explicit "owner only" grant came back as the default, which means the
   same. `core check-login` as `core_server`: "the server would start on this login". `anon`,
   `authenticated`, `service_role` and `authenticator` reach none of the four schemas; `dblink`
   and `postgres_fdw` are not installed.
5. `fly.toml` puts the root at `/etc/supabase-ca.crt` (`[[files]]`, from
   `packages/core/supabase-ca.crt`). `DATABASE_URL` staged through stdin as
   `postgres://core_server:…@db.qcxikcauwonrbftqiitp.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=/etc/supabase-ca.crt`,
   and the same image (`nosuper-206e1b0`) deployed as v132.
6. Checked: `/health`, the start in the log, the server's connection on Supabase over TLS, and in
   Chrome, signed in: Schedule, Ideas and Feed with their data, every call 200, no console error.
7. `brandbase-db`'s machine stopped, so nothing writes to the old copy.

## For the CLI from now on

`core migrate`, publish and promote take `core_login`'s URL on Supabase, and `core migrate <pack>`
takes `core_migrator`'s as `MIGRATOR_DATABASE_URL`. From a network without IPv6 use the session
pooler: `aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `<role>.qcxikcauwonrbftqiitp`, with
`sslmode=verify-full&sslrootcert=<absolute path>/packages/core/supabase-ca.crt`: node-postgres
reads the path from the process's working directory, which `pnpm -F` sets to `packages/core`.
`fly-no-superuser.sh` builds Fly URLs only (database `brandbase`, Keychain service
`brandbase-db`).

## Rollback

`brandbase-db` holds the data as it was at 03:06 UTC on 3 Nov. Start its machine
(`fly machine start 7817d7da059408 -a brandbase-db`), set `DATABASE_URL` back to `core_server` on
`brandbase-db.flycast` (`fly-no-superuser.sh secret brandbase-db.flycast` copies it; then
`fly secrets set --stage DATABASE_URL="$(pbpaste)" -a brandfactory; pbcopy </dev/null`) and
deploy. Anything
written on Supabase since is lost unless copied back.

## The review before destroying `brandbase-db` (3 Nov, Opus and Sonnet)

- **Checked live.** In Chrome, signed in: Schedule (week and month), Ideas (moodboard and current
  ideas), Feed, Inbox: 51 calls, all 200, no console error. Calls are recorded on Supabase. The
  scheduler's 03:56 round ran there: 6 `event.tick` and 6 `event.pull` done, the next booked.
  `claims.calls` is empty (the purge runs). No other Fly app used `brandbase-db`
  (`brandbase-bubbles` has no database). `postgres` keeps only the creator's ADMIN link to the new
  roles (no INHERIT, no SET).
- **Fixed (2.61.3).** The pool had no connect timeout: a connect that got no answer waited for
  ever, holding its caller and a pool slot (reproduced; on Fly's private network this did not
  happen). The pool now gives up after 10 s, and probes a quiet connection after 30 s. Test: "gives up on a server that
  takes the connection and never answers" (it fails without the fix).
- **Backup.** A `pg_dump -Fc` of the four schemas from Supabase after the move (1.8 MB, 42 tables)
  is in the owner's `~/Backups/brandbase/`, outside Supabase. Supabase keeps 7 daily backups, but
  a restore there rolls back sign-in and storage too.
- **Open: R1 has no wall now.** A pack escape to `core_server` can set that login's password
  (`docs/executing/core-no-superuser-plan.md`, R1); the wall was a private network, and Supabase's
  database takes connections from every address. Needs Supabase's network restrictions (an Owner
  or Admin of the org) limited to the Fly machine's static egress address and the owners'. Only
  packs we write run today, so this is before outside packs, not before the destroy.
- **Deploys.** Deploy only from a checkout with this file's commits: main before them has no
  `[[files]]` entry, so the app would not find `/etc/supabase-ca.crt` and would not start.

## Phase 4 (left)

1. Destroy `brandbase-db` (app, machine and volume) with the owner's yes. After that the Rollback
   section above, `packages/core/scripts/fly-no-superuser.sh` and "The owner's steps for Fly" in
   the no-superuser plan are history.
2. Then move this file to `docs/completions/`.
