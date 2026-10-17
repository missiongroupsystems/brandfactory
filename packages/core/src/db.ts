import { PGlite, types } from '@electric-sql/pglite'
import pg from 'pg'

export type Row = Record<string, unknown>

/** One connection's worth of SQL: the database itself, or a transaction on it. */
export interface Conn {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>
  /** Several statements with no parameters: migrations only. */
  exec(text: string): Promise<void>
}

export interface Db extends Conn {
  transaction<T>(fn: (tx: Conn) => Promise<T>): Promise<T>
  close(): Promise<void>
}

// A date column stays the `YYYY-MM-DD` text it holds: a JavaScript Date would move it by the
// server's own zone.
const DATE_OID = 1082
pg.types.setTypeParser(DATE_OID, (v) => v)

const pglites = new WeakMap<Db, PGlite>()

function wrapPglite(client: PGlite): Db {
  const on = (c: Pick<PGlite, 'query' | 'exec'>): Conn => ({
    async query<T>(text: string, params?: unknown[]) {
      return (await c.query<T>(text, params)).rows
    },
    async exec(text) {
      await c.exec(text)
    },
  })
  const db: Db = {
    ...on(client),
    transaction: (fn) => client.transaction((tx) => fn(on(tx))),
    close: () => client.close(),
  }
  pglites.set(db, client)
  return db
}

const pgliteOptions = { parsers: { [types.DATE]: (v: string) => v } }

/** Postgres in process, in memory or kept in `dataDir`: tests and local development. */
export function openPglite(dataDir?: string): Db {
  return wrapPglite(new PGlite(dataDir, pgliteOptions))
}

/** A fresh in-memory database from a dump made by `dumpPglite`: faster than migrating again. */
export async function openPgliteFrom(dump: Blob): Promise<Db> {
  return wrapPglite(new PGlite({ ...pgliteOptions, loadDataDir: dump }))
}

export async function dumpPglite(db: Db): Promise<Blob> {
  const client = pglites.get(db)
  if (!client) throw new Error('not a PGlite database')
  return client.dumpDataDir('none')
}

/** A Postgres server: local Docker, a local Supabase stack, or a deployment. */
export function openPostgres(url: string, max = 5): Db {
  const pool = new pg.Pool({ connectionString: url, max })
  const on = (c: pg.Pool | pg.PoolClient): Conn => ({
    // Always the extended protocol, which runs one statement: with no parameters node-pg would
    // use the simple one, which runs every statement in the text.
    async query<T>(text: string, params: unknown[] = []) {
      const config = { text, values: params, queryMode: 'extended' } as pg.QueryConfig
      return (await c.query(config)).rows as T[]
    },
    async exec(text) {
      await c.query(text)
    },
  })
  return {
    ...on(pool),
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const out = await fn(on(client))
        await client.query('commit')
        client.release()
        return out
      } catch (err) {
        try {
          await client.query('rollback')
          client.release()
        } catch (rollbackErr) {
          // A connection that cannot roll back is dropped, not handed to the next caller.
          client.release(rollbackErr as Error)
        }
        throw err
      }
    },
    close: () => pool.end(),
  }
}
