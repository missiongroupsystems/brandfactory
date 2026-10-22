import { createHash } from 'node:crypto'
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
  const [installed] = await db.query<{ ok: boolean }>(
    `select to_regclass('packs.migrations') is not null as ok`,
  )
  if (!installed?.ok) {
    const [me] = await db.query<{ rolsuper: boolean }>(
      'select rolsuper from pg_roles where rolname = current_user',
    )
    if (!me?.rolsuper) {
      throw new Error(
        'the core must be installed by a superuser: without one, migration 0001 cannot take ' +
          'set_config and the other risky functions from the runtime role ' +
          '(packages/core/src/migrate.ts)',
      )
    }
  }
  const done = await applyMigrations(db, 'core', readMigrations(CORE_DIR))
  // What 0001 is for, checked on every run: a database installed some other way, or a function
  // granted back since, is refused before a pack's SQL can reach it.
  const callable = await db.query<{ proname: string }>(
    `select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'pg_catalog' and has_function_privilege('pack_runtime', p.oid, 'execute')`,
  )
  const risky = callable.map((r) => r.proname).filter(forbiddenFunction)
  if (risky.length > 0) {
    throw new Error(
      `the runtime role can call ${risky.sort().join(', ')}: migration 0001 was not applied by a ` +
        'superuser, or a grant brought them back (packages/core/src/migrate.ts)',
    )
  }
  return done
}
