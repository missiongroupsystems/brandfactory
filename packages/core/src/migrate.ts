import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Db } from './db'
import { migrationProblem, statements } from './sql'

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

export function migrateCore(db: Db) {
  return applyMigrations(db, 'core', readMigrations(CORE_DIR))
}
