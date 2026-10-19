import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openPostgres, type Db } from './db'
import { Refused } from './errors'
import { migrateCore } from './migrate'
import { execute } from './run'
import { claim } from './scheduler'
import { goLive } from './testing'
import { toyPack } from './toy-pack'

/**
 * What PGlite cannot show: it runs one statement at a time and ignores statement_timeout. These
 * run against a real Postgres when CORE_TEST_PG_URL names one (a superuser URL on a throwaway
 * server, such as `docker run -p 54329:5432 -e POSTGRES_PASSWORD=pw postgres:16`).
 */
const url = process.env.CORE_TEST_PG_URL

describe.skipIf(!url)('on a real Postgres', () => {
  let admin: Db
  let db: Db
  const name = `core_test_${randomUUID().replaceAll('-', '')}`

  beforeAll(async () => {
    admin = openPostgres(url!, 1)
    await admin.exec(`create database ${name}`)
    const u = new URL(url!)
    u.pathname = `/${name}`
    db = openPostgres(u.toString())
    await migrateCore(db)
    await goLive(db, toyPack())
  }, 60_000)

  afterAll(async () => {
    await db?.close()
    await admin?.exec(`drop database if exists ${name} with (force)`)
    await admin?.close()
  })

  it('stops a move that runs past the statement timeout', async () => {
    const pack = toyPack()
    const slow = {
      ...pack.ops['note.list']!,
      sql: 'select count(*) as n from generate_series(1, 100000000)',
    }
    const err = await execute(
      { db, now: () => new Date(), statementTimeoutMs: 100 },
      pack,
      slow,
      { principal: 'ana', person: 'ana', agent: null },
      {},
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Refused)
    expect((err as Refused).code).toBe('TIMEOUT')
  })

  it.each([
    "select set_config('app.user_id', 'ben', true) as x",
    "select set_config('role', 'postgres', true) as x",
    'select count(*) as n from packs.pack_versions',
    'select pg_advisory_lock(1) as x',
  ])('denies the runtime role %s', async (sql) => {
    const pack = toyPack()
    const run = execute(
      { db, now: () => new Date() },
      pack,
      { ...pack.ops['note.list']!, sql },
      { principal: 'ana', person: 'ana', agent: null },
      {},
    )
    await expect(run).rejects.toThrow(/permission denied/)
  })

  it('runs one statement only, whatever text reaches the driver', async () => {
    const pack = toyPack()
    const run = execute(
      { db, now: () => new Date() },
      pack,
      { ...pack.ops['note.list']!, sql: 'select 1 as x; reset role; select current_user as who' },
      { principal: 'ana', person: 'ana', agent: null },
      {},
    )
    await expect(run).rejects.toThrow(/multiple commands/)
  })

  it('gives a due call to one of two loops claiming at once', async () => {
    await db.query(`insert into packs.principals (id) values ('ana') on conflict do nothing`)
    await db.query(
      `insert into packs.scheduled_calls (pack, op, key, input, principal, run_at)
       values ('toy', 'note.list', 'k1', '{}', 'ana', now() - interval '1 minute')`,
    )
    const now = () => new Date()
    // Loop A claims inside a transaction that has not committed; loop B claims meanwhile.
    let second: Promise<unknown> = Promise.resolve(null)
    const first = await db.transaction(async (tx) => {
      const mine = await claim({ db: tx as unknown as Db, now })
      second = claim({ db, now })
      await new Promise((r) => setTimeout(r, 300))
      return mine
    })
    expect(first).not.toBeNull()
    // B skipped the row A held; without SKIP LOCKED it would wait, then claim it again.
    expect(await second).toBeNull()
  })
})
