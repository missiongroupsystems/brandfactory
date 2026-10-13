import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { type ExtractTablesWithRelations } from 'drizzle-orm'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { type PgDatabase, type PgQueryResultHKT, type PgTransaction } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'
import * as schema from './schema'

export type Schema = typeof schema
export type Db = PgDatabase<PgQueryResultHKT, Schema>
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>
/** A query runs the same on the database or inside a transaction. */
export type Conn = Db | Tx

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle')

/**
 * Where drizzle keeps its record of applied migrations. Not its default `drizzle` schema: the
 * archive's migrations keep their record there, in the same database. Same as `migrate.mjs`.
 */
const JOURNAL = 'brandbase_drizzle'

export interface DbHandle {
  db: Db
  close(): Promise<void>
}

/**
 * Postgres in process (PGlite), for tests and local development: in memory with no folder, or
 * kept in `dataDir`. Migrations run on open.
 */
export async function openPglite(dataDir?: string): Promise<DbHandle> {
  const client = new PGlite(dataDir)
  const db = drizzlePglite(client, { schema })
  await migratePglite(db, { migrationsFolder, migrationsSchema: JOURNAL })
  return { db: db as unknown as Db, close: () => client.close() }
}

let migrated: Promise<Blob> | null = null

/**
 * Migrates once per test worker and keeps a copy. Called from a `beforeAll` with a long timeout:
 * under a full parallel run the migration can take longer than one test is allowed.
 */
export function migrateTestDb(): Promise<Blob> {
  migrated ??= (async () => {
    const first = await openPglite()
    const client = (first.db as unknown as { $client: PGlite }).$client
    const dump = await client.dumpDataDir('none')
    await first.close()
    return dump
  })()
  return migrated
}

/** A fresh in-memory database for a test, from the migrated copy: faster than migrating again. */
export async function openTestDb(): Promise<DbHandle> {
  const client = new PGlite({ loadDataDir: await migrateTestDb() })
  return { db: drizzlePglite(client, { schema }) as unknown as Db, close: () => client.close() }
}

/** The deployed database. Migrations are applied by `scripts/migrate.mjs`, not on boot. */
export function openPostgres(url: string, max = 5): DbHandle {
  const pool = new pg.Pool({ connectionString: url, max })
  const db = drizzlePg(pool, { schema })
  return { db: db as unknown as Db, close: () => pool.end() }
}

export async function migratePostgres(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  try {
    await migratePg(drizzlePg(pool), { migrationsFolder, migrationsSchema: JOURNAL })
  } finally {
    await pool.end()
  }
}
