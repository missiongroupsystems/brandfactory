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
 * What a transaction may have left on its session, taken away before the next caller gets the
 * connection (docs/executing/core-no-superuser-plan.md, phase 4): the role and every setting
 * (`set_config(…, false)` outlives the transaction), temporary tables (one named like a type
 * changes what the core's own statements mean), cursors kept past the commit, the session's last
 * sequence values, listens, and advisory locks where the login may release them. It is also the
 * session's last statement, so `pg_stat_activity` shows it, not the call's own text and input.
 *
 * Named statements stay, and neither a commit nor a rollback undoes PREPARE or DEALLOCATE: SQL
 * that replaced one would run with the next caller's claims. So the statements the server made are
 * checked too (`held`, the driver's own), and a connection where one changed is dropped.
 */
function cleanText(made: Map<string, string>, parsed: string[]) {
  const quote = (v: string) => `'${v.replaceAll("'", "''")}'`
  return `reset role; reset all; discard temp; close all; discard sequences; unlisten *;
  do $$
  declare
    want jsonb := ${quote(JSON.stringify(Object.fromEntries(made)))}::jsonb;
    parsed text[] := array[${parsed.map(quote).join(', ')}]::text[];
  begin
    if exists (select 1 from pg_catalog.pg_prepared_statements p
        where p.from_sql and (want ->> p.name) is distinct from p.prepare_time::text)
      or exists (select 1 from pg_catalog.jsonb_object_keys(want) k
        where not exists (select 1 from pg_catalog.pg_prepared_statements p
          where p.name = k and p.from_sql))
      or exists (select 1 from pg_catalog.unnest(parsed) n
        where not exists (select 1 from pg_catalog.pg_prepared_statements p
          where p.name = n and not p.from_sql)) then
      raise exception 'a statement the server runs by name was changed';
    end if;
    if pg_catalog.has_function_privilege('pg_catalog.pg_advisory_unlock_all()', 'execute') then
      perform pg_catalog.pg_advisory_unlock_all();
    end if;
  end $$`
}

/**
 * A Postgres server: local Docker, a local Supabase stack, or a deployment. With `prepare`, a
 * query asked to prepare is sent named (`Conn.query`); without it, every statement is unnamed.
 * Named statements need a session that keeps them, so the transaction pooler is refused.
 */
export function openPostgres(
  url: string,
  max = 5,
  opts: { prepare?: boolean; keepSession?: boolean } = {},
): Db {
  const prepare = opts.prepare ?? false
  // The statements each connection holds from `saved` (`PREPARE`, not node-pg's own names), with
  // the time Postgres made each.
  const held = new WeakMap<pg.PoolClient, Map<string, string>>()
  // A pack's test cases (runner.ts) may keep a temporary table from one step to the next, on a
  // throwaway database, as its owner: there nothing is cleaned between transactions.
  const release = (client: pg.PoolClient) => {
    if (opts.keepSession) return Promise.resolve(client.release())
    const parsed = Object.keys(
      (client as unknown as { connection: { parsedStatements: Record<string, string> } }).connection
        .parsedStatements,
    )
    return client.query(cleanText(held.get(client) ?? new Map(), parsed)).then(
      () => client.release(),
      // A connection that cannot be cleaned, or where a statement changed, is dropped.
      (err: Error) => client.release(err),
    )
  }
  if (prepare && new URL(url).port === TRANSACTION_POOLER_PORT) {
    throw new Error(
      'prepared statements need a session: use the direct port or the session pooler, ' +
        `not the transaction pooler on ${TRANSACTION_POOLER_PORT}`,
    )
  }
  // A connection lives at most half an hour, so statements and plans of old versions go with it.
  const pool = new pg.Pool({ connectionString: url, max, maxLifetimeSeconds: 1800 })
  // An idle connection that Postgres ends (a restart, a failover, pg_terminate_backend) reaches
  // the pool as an 'error' event; with no listener, Node ends the process. The pool has already
  // dropped that connection, and the next caller gets a new one.
  pool.on('error', (err) => console.warn('core: an idle database connection ended:', err.message))
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
  async function once<T>(
    fn: (tx: Tx, check: Row[], results: Row[][]) => Promise<T>,
    first?: string,
    saved: Saved[] = [],
  ) {
    const client = await pool.connect()
    const last: string[] = []
    let has = held.get(client)
    if (!has) {
      held.set(client, (has = new Map()))
      // The pool listens to a connection only while it is idle. One that drops during a call
      // (a network or proxy reset) fails that call's query; its 'error' event, unheard, would
      // end the process. The failed call releases it with the error, so the pool drops it.
      client.on('error', () => {})
    }
    const fresh = prepare ? saved.filter((s) => !has.has(s.name)) : []
    if (fresh.length > 0) {
      // In their own message, before the call's: Postgres stamps each with this message's time,
      // which no statement of the call shares, and the clean checks the stamps (`cleanText`).
      try {
        const names = fresh.map((s) => `'${s.name}'`).join(', ')
        const made = (await client.query(
          [
            ...fresh.map((s) => `prepare ${s.name} as ${s.text}`),
            `select name, prepare_time::text as at from pg_catalog.pg_prepared_statements
             where from_sql and name in (${names})`,
          ].join(';\n'),
        )) as unknown as pg.QueryResult[]
        for (const r of made.at(-1)!.rows as { name: string; at: string }[]) has.set(r.name, r.at)
      } catch (err) {
        // Which statements were made is unknown: the connection is dropped.
        client.release(err as Error)
        throw err
      }
    }
    try {
      // The simple protocol, so begin and `first` go in one round trip; the commit and the
      // statements kept for it likewise. One that fails skips the rest, so nothing commits.
      const texts = ['begin']
      if (first) texts.push(first)
      const begun: pg.QueryResult | pg.QueryResult[] = await client.query(texts.join(';\n'))
      const ofFirst = Array.isArray(begun) ? begun.slice(1) : []
      const out = await fn(
        { ...on(client), atCommit: (text) => void last.push(text) },
        checkRows(ofFirst),
        rowsOf(ofFirst),
      )
      await client.query([...last, 'commit'].join(';\n'))
      // Not awaited: the caller has its answer; the connection goes back once it is clean.
      void release(client)
      return out
    } catch (err) {
      // A saved statement the server lost (26000) runs once more on a fresh connection, as named
      // statements do (`transaction`). One whose plan went stale keeps its name, so other
      // connections may hold it stale too: this connection goes, and the caller sends the call
      // without saved statements (`inOneRead`).
      if (saved.length > 0 && (err as { code?: string })?.code === '26000') lost.add(err as object)
      const unsure = saved.length > 0 && isStalePlan(err)
      // node-pg still thinks this connection holds its statements: it is dropped, not reused.
      if (lost.has(err as object) || unsure) {
        client.release(err as Error)
        throw err
      }
      try {
        await client.query('rollback')
        void release(client)
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
