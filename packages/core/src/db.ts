import { createHash } from 'node:crypto'
import { PGlite, types } from '@electric-sql/pglite'
import pg from 'pg'

export type Row = Record<string, unknown>

/** One connection's worth of SQL: the database itself, or a transaction on it. */
export interface Conn {
  /**
   * `prepare` sends the statement named, so each connection parses and plans it once. Only for
   * text that never changes once written (a published version's moves and rules): every text
   * keeps its name on every connection that ran it. PGlite, and a server opened without
   * `prepare` (`openPostgres`), ignore it.
   */
  query<T = Row>(text: string, params?: unknown[], opts?: { prepare?: boolean }): Promise<T[]>
  /** Several statements with no parameters: migrations only. */
  exec(text: string): Promise<void>
}

/** A transaction: its SQL, and statements kept to go with its commit. */
export interface Tx extends Conn {
  /**
   * Runs `text` (no parameters) just before the commit, in the same round trip. If the work
   * throws first, it never runs; if it fails, nothing commits.
   */
  atCommit(text: string): void
}

/** A statement `first` runs by name (`EXECUTE`), saved with `PREPARE` on each connection once. */
export interface Saved {
  name: string
  text: string
}

export interface Db extends Conn {
  /**
   * `first` (no parameters, built by the core alone) runs right after begin, in one round trip.
   * `fn` gets the rows of `first`'s result that has a `core_check` column, or none, and the rows
   * of each of `first`'s statements. `saved` statements go before the begin, in the same trip, on
   * a connection that does not hold them yet; only a server opened with `prepare` takes them.
   */
  transaction<T>(
    fn: (tx: Tx, check: Row[], results: Row[][]) => Promise<T>,
    first?: string,
    saved?: Saved[],
  ): Promise<T>
  /** Whether `transaction` takes `saved` statements (a server opened with `prepare`). */
  readonly saves: boolean
  close(): Promise<void>
}

/** A refusal the database raised for the core (migration 0008): P0001 `core_refused`. */
export const isCoreRefusal = (err: unknown) => {
  const e = err as { code?: string; message?: string }
  return e?.code === 'P0001' && e.message === 'core_refused'
}

// A date column stays the `YYYY-MM-DD` text it holds: a JavaScript Date would move it by the
// server's own zone.
const DATE_OID = 1082
pg.types.setTypeParser(DATE_OID, (v) => v)

const pglites = new WeakMap<Db, PGlite>()

/** The rows of the result, among several, whose columns include `core_check`. */
function checkRows(results: { fields: { name: string }[]; rows: unknown[] }[]): Row[] {
  const found = results.find((r) => r.fields.some((f) => f.name === 'core_check'))
  return (found?.rows ?? []) as Row[]
}

const rowsOf = (results: { rows: unknown[] }[]) => results.map((r) => r.rows as Row[])

function wrapPglite(client: PGlite): Db {
  // PGlite's close does not wait for a query in flight, and that query's next protocol message
  // then spins forever at full CPU (0.5.8). So close refuses new work and waits for the rest.
  const inFlight = new Set<Promise<unknown>>()
  let closing: Promise<void> | null = null
  const guard = <T>(work: () => Promise<T>): Promise<T> => {
    if (closing) return Promise.reject(new Error('the database is closed'))
    const p = work()
    const done = () => inFlight.delete(p)
    inFlight.add(p)
    p.then(done, done)
    return p
  }
  const on = (c: Pick<PGlite, 'query' | 'exec'>): Conn => ({
    async query<T>(text: string, params?: unknown[]) {
      return (await c.query<T>(text, params)).rows
    },
    async exec(text) {
      await c.exec(text)
    },
  })
  const top = on(client)
  const db: Db = {
    query: (text, params) => guard(() => top.query(text, params)),
    exec: (text) => guard(() => top.exec(text)),
    saves: false,
    transaction: (fn, first) =>
      guard(() =>
        client.transaction(async (tx) => {
          const results = first ? await tx.exec(first) : []
          const last: string[] = []
          const out = await fn(
            { ...on(tx), atCommit: (text) => void last.push(text) },
            checkRows(results),
            rowsOf(results),
          )
          for (const text of last) await tx.exec(text)
          return out
        }),
      ),
    close: () =>
      (closing ??= (async () => {
        while (inFlight.size > 0) await Promise.allSettled(inFlight)
        await client.close()
      })()),
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

/**
 * A prepared statement planned before a table it reads changed shape. Postgres plans it again on
 * its own, unless the change alters the columns it answers (a `select *`): then it fails this way.
 */
export const isStalePlan = (err: unknown) => {
  const e = err as { code?: string; message?: string }
  return e?.code === '0A000' && /cached plan must not change result type/.test(e.message ?? '')
}

/** Errors of a named statement the server no longer holds (a pooler, a `deallocate`). */
const lost = new WeakSet<object>()

/** The port of Supabase's pooler in transaction mode, which keeps no statement between calls. */
const TRANSACTION_POOLER_PORT = '6543'

/**
 * A Postgres server: local Docker, a local Supabase stack, or a deployment. With `prepare`, a
 * query asked to prepare is sent named (`Conn.query`); without it, every statement is unnamed.
 * Named statements need a session that keeps them, so the transaction pooler is refused.
 */
export function openPostgres(url: string, max = 5, opts: { prepare?: boolean } = {}): Db {
  const prepare = opts.prepare ?? false
  if (prepare && new URL(url).port === TRANSACTION_POOLER_PORT) {
    throw new Error(
      'prepared statements need a session: use the direct port or the session pooler, ' +
        `not the transaction pooler on ${TRANSACTION_POOLER_PORT}`,
    )
  }
  // A connection lives at most half an hour, so statements and plans of old versions go with it.
  const pool = new pg.Pool({ connectionString: url, max, maxLifetimeSeconds: 1800 })
  // A text whose statement went stale gets a new name on every connection, so each prepares it
  // again; the old one is left to its connection.
  const renamed = new Map<string, number>()
  const nameOf = (text: string) => {
    const n = renamed.get(text)
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 40)
    return n ? `core_${hash}_${n}` : `core_${hash}`
  }
  const on = (c: pg.Pool | pg.PoolClient): Conn => ({
    // Always the extended protocol, which runs one statement: with no parameters node-pg would
    // use the simple one, which runs every statement in the text.
    async query<T>(text: string, params: unknown[] = [], opts: { prepare?: boolean } = {}) {
      const name = prepare && opts.prepare ? nameOf(text) : undefined
      const config = { text, values: params, queryMode: 'extended', name } as pg.QueryConfig
      try {
        return (await c.query(config)).rows as T[]
      } catch (err) {
        if (name && isStalePlan(err)) renamed.set(text, (renamed.get(text) ?? 0) + 1)
        if (name && (err as { code?: string })?.code === '26000') lost.add(err as object)
        throw err
      }
    },
    async exec(text) {
      await c.query(text)
    },
  })
  // The statements each connection holds from `saved` (`PREPARE`, not node-pg's own names).
  const held = new WeakMap<pg.PoolClient, Set<string>>()
  async function once<T>(
    fn: (tx: Tx, check: Row[], results: Row[][]) => Promise<T>,
    first?: string,
    saved: Saved[] = [],
  ) {
    const client = await pool.connect()
    const last: string[] = []
    let has = held.get(client)
    if (!has) held.set(client, (has = new Set()))
    const fresh = prepare ? saved.filter((s) => !has.has(s.name)) : []
    try {
      // The simple protocol, so begin and `first` go in one round trip; the commit and the
      // statements kept for it likewise. One that fails skips the rest, so nothing commits.
      const texts = [...fresh.map((s) => `prepare ${s.name} as ${s.text}`), 'begin']
      if (first) texts.push(first)
      const begun: pg.QueryResult | pg.QueryResult[] = await client.query(texts.join(';\n'))
      const ofFirst = Array.isArray(begun) ? begun.slice(fresh.length + 1) : []
      for (const s of fresh) has.add(s.name)
      const out = await fn(
        { ...on(client), atCommit: (text) => void last.push(text) },
        checkRows(ofFirst),
        rowsOf(ofFirst),
      )
      await client.query([...last, 'commit'].join(';\n'))
      client.release()
      return out
    } catch (err) {
      // A statement saved before a failure stays saved; a core refusal comes after every
      // `prepare`, so they all ran. After any other failure which ran is unknown, and a
      // statement the server lost (26000) leaves the same doubt: the connection is dropped.
      // A saved statement the server lost runs once more on a fresh connection, as named
      // statements do (`transaction`). One whose plan went stale keeps its name, so other
      // connections may hold it stale too: this connection goes, and the caller sends the call
      // without saved statements (`inOneRead`).
      if (fresh.length > 0 && isCoreRefusal(err)) for (const s of fresh) has.add(s.name)
      if (saved.length > 0 && (err as { code?: string })?.code === '26000') lost.add(err as object)
      const unsure =
        (fresh.length > 0 && !isCoreRefusal(err)) || (saved.length > 0 && isStalePlan(err))
      // node-pg still thinks this connection holds its statements: it is dropped, not reused.
      if (lost.has(err as object) || unsure) {
        client.release(err as Error)
        throw err
      }
      try {
        await client.query('rollback')
        client.release()
      } catch (rollbackErr) {
        // A connection that cannot roll back is dropped, not handed to the next caller.
        client.release(rollbackErr as Error)
      }
      throw err
    }
  }
  return {
    ...on(pool),
    saves: prepare,
    async transaction(fn, first, saved) {
      try {
        return await once(fn, first, saved)
      } catch (err) {
        // The statement has its new name, or the connection that lost it is gone: the whole
        // transaction runs once more. A stale saved statement is the caller's to route.
        if (!lost.has(err as object) && (!isStalePlan(err) || saved?.length)) throw err
        return once(fn, first, saved)
      }
    },
    close: () => pool.end(),
  }
}
