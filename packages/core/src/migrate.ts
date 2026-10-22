import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Db } from './db'
import { forbiddenFunction, migrationProblem, statements } from './sql'

export interface Migration {
  name: string
  sql: string
}

const CORE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

/** The `.sql` files of a folder, in filename order. */
export function readMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), 'utf8') }))
}

const hashOf = (sql: string) => createHash('sha256').update(sql).digest('hex')

/**
 * Applies the migrations of one scope ('core', or a pack's name) that are not yet recorded, each
 * in its own transaction, as the login role. A recorded migration whose text changed is refused:
 * an applied migration is never edited, only followed by a new one.
 */
export async function applyMigrations(db: Db, scope: string, migrations: Migration[]) {
  return apply(db, scope, migrations, null)
}

/**
 * A pack's migrations, run as pack_migrator: what they make, it owns; it has no right in schema
 * `packs` and is not a superuser, so a migration cannot change the registry or its guards.
 */
export function applyPackMigrations(db: Db, pack: string, migrations: Migration[]) {
  for (const m of migrations) {
    const problem = migrationProblem(m.sql)
    if (problem) throw new Error(`migration ${pack}/${m.name}: ${problem}`)
  }
  return apply(db, pack, migrations, 'pack_migrator')
}

async function apply(db: Db, scope: string, migrations: Migration[], role: string | null) {
  const [exists] = await db.query<{ ok: boolean }>(
    `select to_regclass('packs.migrations') is not null as ok`,
  )
  const applied = new Map<string, string>()
  if (exists?.ok) {
    const rows = await db.query<{ name: string; hash: string }>(
      'select name, hash from packs.migrations where scope = $1',
      [scope],
    )
    for (const r of rows) applied.set(r.name, r.hash)
  }
  const done: string[] = []
  for (const m of migrations) {
    const hash = hashOf(m.sql)
    const before = applied.get(m.name)
    if (before !== undefined) {
      if (before !== hash) throw new Error(`migration ${scope}/${m.name} changed after it ran`)
      continue
    }
    await db.transaction(async (tx) => {
      if (role) {
        // One statement at a time, through the protocol that runs one statement only: the text
        // was checked at publish (migrationProblem), and nothing here can end this transaction
        // or leave the role.
        await tx.exec(`set local role ${role}`)
        for (const st of statements(m.sql)) await tx.query(st)
        await tx.exec('reset role')
      } else {
        await tx.exec(m.sql)
      }
      await tx.query('insert into packs.migrations (scope, name, hash) values ($1, $2, $3)', [
        scope,
        m.name,
        hash,
      ])
    })
    done.push(m.name)
  }
  return done
}

/**
 * The core's migrations, as the login role. The first install needs that role to be a superuser:
 * 0001 takes risky functions (`set_config`, the `*_to_xml` family, large objects…) from PUBLIC,
 * which only their owner can do. Without it Postgres skips the revokes with a warning, and a
 * pack's SQL could reach `set_config('role', …)` and leave pack_runtime for the login role. A
 * managed Postgres that gives no superuser (Supabase, Fly Managed Postgres) is refused here.
 */
export async function migrateCore(db: Db) {
  const migrations = readMigrations(CORE_DIR)
  const [me] = await db.query<{ rolsuper: boolean; installed: boolean }>(
    `select rolsuper, to_regclass('packs.migrations') is not null as installed
     from pg_roles where rolname = current_user`,
  )
  if (!me?.installed && !me?.rolsuper) {
    throw new Error(
      'the core must be installed by a superuser: without one, migration 0001 cannot take ' +
        'set_config and the other risky functions from the runtime role ' +
        '(packages/core/src/migrate.ts)',
    )
  }
  if (me?.installed && !me.rolsuper) {
    // A core migration run by the login would do less without a word: a revoke on a function it
    // does not own is only a warning. So a pending one waits for the superuser.
    const applied = await db.query<{ name: string }>(
      `select name from packs.migrations where scope = 'core'`,
    )
    const pending = migrations.filter((m) => !applied.some((a) => a.name === m.name))
    if (pending.length > 0) {
      throw new Error(
        `core migrations ${pending.map((m) => m.name).join(', ')} wait for the superuser: run ` +
          '`core migrate` as it, then `core setup-login` again (packages/core/src/migrate.ts)',
      )
    }
  }
  const done = await applyMigrations(db, 'core', migrations)
  // Postgres's own rule, which 0001 broke for roles it found (0010): only a superuser reads or
  // writes server files or reloads the configuration.
  const servers = await db.query<{ role: string; proname: string }>(
    `select distinct r.rolname as role, p.proname
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace, pg_roles r
     where n.nspname = 'pg_catalog' and not r.rolsuper and r.rolname not like 'pg\\_%'
       and p.proname in ('lo_import', 'lo_export', 'pg_read_file', 'pg_read_binary_file',
         'pg_ls_dir', 'pg_stat_file', 'pg_reload_conf')
       and has_function_privilege(r.oid, p.oid, 'execute')`,
  )
  if (servers.length > 0) {
    const named = [...new Set(servers.map((r) => `${r.role} ${r.proname}`))].sort()
    throw new Error(
      `a role that is not a superuser can call a superuser's function (${named.join(', ')}): ` +
        'revoke it as the superuser (migration 0010 took them back once, at install)',
    )
  }
  // What 0001 and 0009 are for, checked on every run: a database installed some other way, or a
  // function granted back since, is refused before a pack's SQL or migrations can reach it.
  const callable = await db.query<{ role: string; proname: string }>(
    `select distinct r.role, p.proname
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       unnest(array['pack_runtime', 'pack_admin', 'pack_migrator']) as r(role)
     where n.nspname = 'pg_catalog' and has_function_privilege(r.role, p.oid, 'execute')`,
  )
  const risky = callable.filter((r) => forbiddenFunction(r.proname))
  if (risky.length > 0) {
    const named = [...new Set(risky.map((r) => `${r.role} ${r.proname}`))].sort()
    throw new Error(
      `a pack role can call a function 0001 takes away (${named.join(', ')}): the core was not ` +
        'installed by a superuser, or a grant brought them back (packages/core/src/migrate.ts)',
    )
  }
  return done
}

/** A login role's name: lowercase, so it needs no quotes in SQL. */
const ROLE = /^[a-z_][a-z0-9_]{0,62}$/

/**
 * A SCRAM-SHA-256 verifier for `password`, as Postgres stores it: what the server keeps, from which
 * the password cannot be read back. Sent in its place, so the password itself reaches no server
 * log; the verifier may, where DDL is logged, and allows guessing offline, so the password is long
 * and random.
 */
export function scramVerifier(password: string, salt = randomBytes(16), iterations = 4096) {
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256')
  const hmac = (key: Buffer, text: string) => createHmac('sha256', key).update(text).digest()
  const stored = createHash('sha256').update(hmac(salted, 'Client Key')).digest()
  const server = hmac(salted, 'Server Key')
  const b64 = (b: Buffer) => b.toString('base64')
  return `SCRAM-SHA-256$${iterations}:${b64(salt)}$${b64(stored)}:${b64(server)}`
}

/**
 * The login a deployed core runs as, made once by the superuser that installed it
 * (`core setup-login`). Not a superuser: every escape a review found ends at the session user
 * (`docs/completions/packs-core-phases-1-to-8.md`, phase 3), so that user may do only what the core
 * does. It is a member of the pack roles, owns the core's schemas and what is in them, and may
 * call `set_config`, the one function migration 0001 took from PUBLIC that the core itself uses.
 * Run again, it resets the password, the attributes, the ownership and the functions; other
 * memberships the login holds stay. Roles belong to the server: one database per server.
 */
export async function setupLogin(db: Db, role: string, password: string) {
  if (!ROLE.test(role))
    throw new Error(`a login role is lowercase letters, digits and _, not ${role}`)
  if (role.startsWith('pack_') || role.startsWith('pg_')) throw new Error(`${role} is reserved`)
  // Letters, digits, - and _: the same before and after Postgres prepares it (SASLprep), and it
  // goes in DATABASE_URL as it is.
  if (!/^[A-Za-z0-9_-]{24,}$/.test(password)) {
    throw new Error('the password is 24 or more letters, digits, - or _ (openssl rand -hex 24)')
  }
  return db.transaction(async (tx) => {
    const [me] = await tx.query<{ rolsuper: boolean }>(
      'select rolsuper from pg_roles where rolname = current_user',
    )
    if (!me?.rolsuper) throw new Error('setup-login runs as the superuser that installed the core')
    // Only the core's own login is made or reset: never the role running this, a superuser, or a
    // role the core did not make (one that is not yet a member of pack_runtime).
    const [found] = await tx.query<{ me: boolean; rolsuper: boolean; ours: boolean }>(
      `select rolname = current_user as me, rolsuper,
         exists (select 1 from pg_auth_members m
           where m.member = r.oid and m.roleid = 'pack_runtime'::regrole) as ours
       from pg_roles r where rolname = $1`,
      [role],
    )
    if (found && (found.me || found.rolsuper || !found.ours)) {
      throw new Error(`${role} exists and is not the core's login: choose another name`)
    }
    const verifier = scramVerifier(password).replaceAll("'", "''")
    const attributes = `login nosuperuser nocreatedb nocreaterole noreplication nobypassrls`
    await tx.exec(
      found
        ? `alter role ${role} with ${attributes} password '${verifier}'`
        : `create role ${role} with ${attributes} password '${verifier}'`,
    )
    await tx.exec(`grant pack_runtime, pack_admin, pack_migrator to ${role}`)
    const owned = await tx.query<{ sql: string }>(
      `select format('alter schema %I owner to %I', nspname, $1::text) as sql
       from pg_namespace where nspname in ('packs', 'claims', 'textfn')
       union all
       select format('alter %s %I.%I owner to %I',
         case c.relkind when 'v' then 'view' when 'm' then 'materialized view'
           when 'S' then 'sequence' else 'table' end, n.nspname, c.relname, $1::text)
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('packs', 'claims', 'textfn') and c.relkind in ('r', 'p', 'v', 'm', 'S')
         and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
           and d.objid = c.oid and d.deptype in ('a', 'i'))
       union all
       select format('alter function %s owner to %I', p.oid::regprocedure, $1::text)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('packs', 'claims', 'textfn')`,
      [role],
    )
    for (const { sql } of owned) await tx.exec(sql)
    // A login that existed when 0001 ran got every function on its list back; it keeps only
    // set_config.
    const granted = await tx.query<{ fn: string; proname: string }>(
      `select p.oid::regprocedure::text as fn, p.proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'pg_catalog' and has_function_privilege($1, p.oid, 'execute')`,
      [role],
    )
    for (const { fn } of granted.filter((g) => forbiddenFunction(g.proname))) {
      await tx.exec(`revoke execute on function ${fn} from ${role}`)
    }
    await tx.exec(`grant execute on function pg_catalog.set_config(text, text, boolean) to ${role}`)
    return owned.length
  })
}
