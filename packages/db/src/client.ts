import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// NB: registering a `pg` type parser for timestamptz here does NOT work —
// drizzle passes its own `types.getTypeParser` in every query config, which
// returns timestamp values verbatim so its column `mode` can handle them.
// That override wins over the global registry. Timestamps are normalised to
// ISO in `mappers.ts` instead; see the note there.

// Lazy singleton: the pool / drizzle instance are constructed on first
// access, not at module import. Lets test runners and tooling import
// `@brandfactory/db` (e.g. for the `User` row type) without DATABASE_URL
// being set. Real query helpers still throw if no connection string is
// configured by the time they run.

/**
 * Connections this process may hold. See the note in `makePool` — this number
 * is half of a pair, and the other half is the Machine count in `fly.toml`.
 */
const POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 5)

let _pool: Pool | null = null
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }
  // Pooler-safety invariant: do NOT enable server-side prepared statements on
  // this Pool and do NOT introduce `pg-native` — both break transaction-mode
  // pooling by assuming session-scoped state that the pooler multiplexes away.
  //
  // ⚠️ **Production is on the SESSION-mode pooler, port 5432 — not transaction
  // mode.** This comment claimed transaction mode on 6543 from Phase 2 until
  // 5 October 2026, and it was never true; it described an intention. Keeping
  // the rule above is still right, because transaction mode is where this is
  // going, but do not read it as a description of the deployment.
  //
  // The move is blocked on one thing and it is not this file: the realtime
  // backplane is Postgres LISTEN/NOTIFY and reuses `DATABASE_URL`, and `LISTEN`
  // cannot survive a transaction pooler. The plan to split the two connection
  // strings is `docs/executing/transaction-pooler-plan.md`.
  // node-postgres' default path is safe (no prepared-statement cache).
  //
  // ⚠️ **`max` is stated, because the default is 10 and nobody chose it.**
  // On 5 October 2026 production answered `GET /workspaces` with a 500:
  //
  //   (EMAXCONNSESSION) max clients reached in session mode
  //   - max clients are limited to pool_size: 15
  //
  // Three facts multiplied. The deployed `DATABASE_URL` pointed at the
  // **session-mode** pooler on port 5432 rather than the transaction-mode one
  // on 6543 — so the invariant above described an intention, not the
  // connection — and in session mode every pooled client holds a server
  // connection for its whole life rather than only for a statement. Two Fly
  // Machines were running. Two Pools at the default of 10 is 20 against a
  // limit of 15, so the budget could be exceeded by configuration alone, and
  // under any concurrency it was. The failure landed in `getUserById`, the
  // first read every authenticated request makes, so it read as the whole app
  // being down rather than as one slow query.
  //
  // **The arithmetic has to hold on every deployment**: `max` × Machines must
  // stay under the pooler's `pool_size`. At 5 and two Machines that is 10 of
  // 15, leaving headroom for `migrate.mjs` and a psql session during a deploy.
  // `fly.toml` carries the same note beside the Machine count, because the two
  // numbers are one decision.
  return new Pool({ connectionString, max: POOL_MAX })
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    _pool ??= makePool()
    const value = (_pool as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(_pool) : value
  },
}) as Pool

export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop) {
      if (!_db) {
        _pool ??= makePool()
        _db = drizzle(_pool, { schema })
      }
      const value = (_db as unknown as Record<string | symbol, unknown>)[prop]
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(_db) : value
    },
  },
) as ReturnType<typeof drizzle<typeof schema>>
