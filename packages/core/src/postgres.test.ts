import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openPostgres, type Db } from './db'
import { Refused } from './errors'
import { migrateCore } from './migrate'
import { hashOf } from './pack'
import { addPrincipal, promote, publish, recordTestRun, setLoadout } from './registry'
import { call, execute } from './run'
import { claim } from './scheduler'
import { deps as depsOf, goLive, OWNER } from './testing'
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

  let dbUrl: string

  beforeAll(async () => {
    admin = openPostgres(url!, 1)
    await admin.exec(`create database ${name}`)
    const u = new URL(url!)
    u.pathname = `/${name}`
    dbUrl = u.toString()
    // Unnamed statements, as a core runs by default; the block below runs both ways.
    db = openPostgres(dbUrl)
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

  it("runs rules and moves as pack_runtime with the caller's claims, keyed or not", async () => {
    const pack = toyPack()
    const asRuntime = {
      id: 'as.runtime',
      sql: "select current_user = 'pack_runtime' and claims.user_id() = 'ana' as ok",
      status: 500,
      code: 'NOT_RUNTIME',
      message: 'not the runtime role',
    }
    const content = { ...pack, rules: { ...pack.rules, 'as.runtime': asRuntime } }
    const read = {
      ...pack.ops['note.list']!,
      before: ['as.runtime'],
      sql: `select current_user::text as who, claims.user_id() as user_id,
              current_setting('statement_timeout') as timeout`,
      returns: 'one' as const,
    }
    const write = {
      ...read,
      sql: `with w as (update toy.notes set body = body where false returning 1)
            select current_user::text as who, claims.user_id() as user_id,
              current_setting('statement_timeout') as timeout`,
    }
    const caller = { principal: 'ana', person: 'ana', agent: null }
    const d = { db, now: () => new Date(), statementTimeoutMs: 1234 }
    const want = { who: 'pack_runtime', user_id: 'ana', timeout: '1234ms' }
    expect(await execute(d, content, read, caller, {})).toEqual(want)
    expect(await execute(d, content, write, caller, {}, { key: `k-${randomUUID()}` })).toEqual(want)
    // Nothing of the call outlives it on the connection it used.
    const [after] = await db.query<{ who: string; user_id: string | null }>(
      'select current_user::text as who, claims.user_id() as user_id',
    )
    expect(after).toEqual({ who: 'postgres', user_id: null })
  })

  it('logs a call, refused or not, with its input as sent', async () => {
    const pack = toyPack()
    await addPrincipal(db, 'ana')
    await setLoadout(db, 'ana', 'toy', Object.keys(pack.ops))
    const deps = { ...depsOf(db), now: () => new Date() }
    const id = `n-${randomUUID().slice(0, 8)}`
    const body = `it's \\ a "note"; drop table packs.op_calls; -- ünïcode 🌿`
    const req = { authorization: 'Bearer ana', pack: 'toy', op: 'note.add' }
    await call(deps, { ...req, input: { id, body } })
    await expect(call(deps, { ...req, input: { id: `${id}-x`, body: 'LOUD' } })).rejects.toThrow(
      /capitals/,
    )
    await setLoadout(db, 'ana', 'toy', [])
    await expect(call(deps, { ...req, input: { id, body } })).rejects.toThrow(/loadout/)
    const rows = await db.query<{ input: { id: string }; status: number; code: string | null }>(
      `select input, status, code from packs.op_calls
       where principal = 'ana' and input ->> 'id' like $1 order by id`,
      [`${id}%`],
    )
    expect(rows).toEqual([
      { input: { id, body }, status: 200, code: null },
      { input: { id: `${id}-x`, body: 'LOUD' }, status: 400, code: 'SHOUTING' },
      { input: { id, body }, status: 403, code: 'FORBIDDEN' },
    ])
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

  /** A version with a rule that holds only as pack_runtime under the caller's claims. */
  let keyedLive: Promise<void> | null = null
  const keyedVersion = () =>
    (keyedLive ??= (async () => {
      await db.exec(`create table toy.tall (id text primary key, owner text not null);
        grant select, insert on toy.tall to pack_runtime`)
      const v = toyPack('1.2.0')
      v.rules['as.runtime'] = {
        id: 'as.runtime',
        sql: "select current_user = 'pack_runtime' and claims.user_id() = :actor as ok",
        status: 403,
        code: 'NOT_RUNTIME',
        message: 'not the runtime role',
      }
      v.ops['note.add'] = { ...v.ops['note.add']!, before: ['note.quiet', 'as.runtime'] }
      v.ops['tall.add'] = {
        name: 'tall.add',
        description: 'Adds a row and answers every column it has.',
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        sql: 'insert into toy.tall (id, owner) values (:id, :actor) returning *',
        returns: 'one',
        before: ['as.runtime'],
      }
      await publish(db, v, OWNER)
      await recordTestRun(db, {
        pack: 'toy',
        version: '1.2.0',
        hash: hashOf(v),
        passed: true,
        results: [],
      })
      await promote(db, { actor: OWNER, environment: 'keyed', pack: 'toy', version: '1.2.0' })
      await addPrincipal(db, 'gus')
      await setLoadout(db, 'gus', 'toy', Object.keys(v.ops))
    })())

  /** A database on its own pool whose first trips are kept, to show which way a call went. */
  function watchedPool(prepare: boolean, max = 5) {
    const inner = openPostgres(dbUrl, max, { prepare })
    const firsts: string[] = []
    const watchedDb: Db = {
      ...inner,
      transaction: (fn, first, saved) => {
        firsts.push(first ?? '')
        return inner.transaction(fn, first, saved)
      },
    }
    const oneTrip = () => firsts.filter((f) => f.includes('core_check')).length
    // Calls whose first trip also held the rules and the move (`inOneRead`).
    const oneRead = () => firsts.filter((f) => f.includes('packs.judge')).length
    return { db: watchedDb, oneTrip, oneRead, close: () => inner.close() }
  }

  /**
   * A version with a read that writes a row through a function as it reads (as a pack's own
   * function could), and a rule that refuses with its own words and details.
   */
  let readsLive: Promise<void> | null = null
  const readsVersion = () =>
    (readsLive ??= (async () => {
      await db.exec(`create table toy.touched (who text not null);
        grant select, insert on toy.touched to pack_runtime;
        create function toy.touch(who text) returns int language plpgsql
          as $f$ begin insert into toy.touched values (who); return 1; end $f$;
        grant execute on function toy.touch(text) to pack_runtime`)
      const v = toyPack('1.3.0')
      v.rules['gate.open'] = {
        id: 'gate.open',
        sql: `select :open::boolean as ok,
          case when :open::boolean then 'open' else 'the gate is shut' end as message,
          jsonb_build_object('open', :open::boolean) as details`,
        status: 409,
        code: 'GATE_SHUT',
        message: 'shut',
      }
      v.ops['touch.read'] = {
        name: 'touch.read',
        description: 'Answers one, and writes a row through a function as it reads.',
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['open', 'n'],
          properties: {
            open: { type: 'boolean' },
            n: { type: 'string', pattern: '^[0-9]$' },
            tag: { type: 'string' },
          },
        },
        sql: "select toy.touch(:actor) / (:n)::int + 0 * length(coalesce(:tag, '')) as result",
        returns: 'one',
        before: ['gate.open'],
      }
      await publish(db, v, OWNER)
      await recordTestRun(db, {
        pack: 'toy',
        version: '1.3.0',
        hash: hashOf(v),
        passed: true,
        results: [],
      })
      await promote(db, { actor: OWNER, environment: 'reads', pack: 'toy', version: '1.3.0' })
    })())
  const touch = (who: string, input: { open: boolean; n: string; tag?: string }) => ({
    authorization: `Bearer ${who}`,
    pack: 'toy',
    op: 'touch.read',
    input,
  })
  const req = (who: string, op: string, input: unknown = {}) => ({
    authorization: `Bearer ${who}`,
    pack: 'toy',
    op,
    input,
  })
  const pack = toyPack()

  // The one first trip with named statements (DATABASE_PREPARE=on) and with unnamed ones (off).
  describe.each([{ prepare: true }, { prepare: false }])(
    'a call whose version this process has read (prepare: $prepare)',
    ({ prepare }) => {
      const tag = prepare ? 'on' : 'off'
      const watched = (max = 5) => watchedPool(prepare, max)

      it('plans a read once per connection and never shows one person what is the other’s', async () => {
        for (const p of ['cy', 'dee']) {
          await addPrincipal(db, p)
          await setLoadout(db, p, 'toy', Object.keys(pack.ops))
        }
        await db.query(
          `insert into toy.notes (id, owner, body) values ('cy-1', 'cy', 'cy only'),
           ('dee-1', 'dee', 'dee only'), ('dee-2', 'dee', 'dee too') on conflict do nothing`,
        )
        // One connection, so both people run the very same prepared statement on it.
        const w = watched(1)
        const deps = { ...depsOf(w.db), now: () => new Date() }
        try {
          for (let i = 0; i < 10; i++) {
            expect(await call(deps, req('cy', 'note.list'))).toEqual([
              { id: 'cy-1', body: 'cy only' },
            ])
            expect(await call(deps, req('dee', 'note.list'))).toEqual([
              { id: 'dee-1', body: 'dee only' },
              { id: 'dee-2', body: 'dee too' },
            ])
          }
          // All but the first call went in one first trip, and the read ran on a generic plan:
          // the row rules held under a plan made once. Each person's first call admits them; the
          // rest run the read in that trip too, as a statement saved with PREPARE (`one_…`).
          expect(w.oneTrip()).toBe(19)
          if (!prepare) {
            expect(await w.db.query('select 1 from pg_prepared_statements')).toEqual([])
            return
          }
          const [plans] = await w.db.query<{ generic: number; custom: number }>(
            `select coalesce(sum(generic_plans), 0)::int as generic,
             coalesce(sum(custom_plans), 0)::int as custom
           from pg_prepared_statements
           where statement like '%select id, body from toy.notes order by id%'`,
          )
          expect(plans!.generic).toBeGreaterThanOrEqual(12)
          // A read with a parameter switches to a generic plan only after five custom ones.
          const like = {
            ...pack.ops['note.list']!,
            sql: 'select id from toy.notes where id like :p',
          }
          for (let i = 0; i < 10; i++) {
            for (const p of ['cy', 'dee']) {
              const rows = await execute(
                deps,
                pack,
                like,
                { principal: p, person: p, agent: null },
                {
                  p: '%',
                },
              )
              expect((rows as { id: string }[]).every((r) => r.id.startsWith(`${p}-`))).toBe(true)
              expect((rows as unknown[]).length).toBe(p === 'cy' ? 1 : 2)
            }
          }
          const [liked] = await w.db.query<{ generic: number }>(
            `select generic_plans::int as generic from pg_prepared_statements
           where statement = 'select id from toy.notes where id like $1'`,
          )
          expect(liked!.generic).toBeGreaterThan(0)
        } finally {
          await w.close()
        }
      })

      it('runs the version promoted between two calls, not the one it read before', async () => {
        const environment = `promoted-${tag}`
        const version = prepare ? '1.1.0' : '1.1.1'
        await promote(db, { actor: OWNER, environment, pack: 'toy', version: '1.0.0' })
        await addPrincipal(db, 'cy')
        await setLoadout(db, 'cy', 'toy', Object.keys(pack.ops))
        const w = watched()
        const deps = { ...depsOf(w.db), environment, now: () => new Date() }
        try {
          expect(Array.isArray(await call(deps, req('cy', 'note.list')))).toBe(true)
          const v2 = toyPack(version)
          v2.ops['note.list'] = { ...v2.ops['note.list']!, sql: `select 'v2' as result` }
          v2.ops['note.list'].returns = 'one'
          await publish(db, v2, OWNER)
          await recordTestRun(db, {
            pack: 'toy',
            version,
            hash: hashOf(v2),
            passed: true,
            results: [],
          })
          await promote(db, { actor: OWNER, environment, pack: 'toy', version })
          expect(await call(deps, req('cy', 'note.list'))).toBe('v2')
          // The second call tried the one first trip, saw a new hash and went the long way.
          expect(w.oneTrip()).toBe(1)
          expect(await call(deps, req('cy', 'note.list'))).toBe('v2')
          expect(w.oneTrip()).toBe(2)
        } finally {
          await w.close()
        }
      })

      it('refuses a stranger and a person without the move in the first trip, writes nothing, and logs both', async () => {
        await addPrincipal(db, 'cy')
        await setLoadout(db, 'cy', 'toy', Object.keys(pack.ops))
        await addPrincipal(db, 'eve')
        await setLoadout(db, 'eve', 'toy', ['note.list'])
        const w = watched()
        const deps = { ...depsOf(w.db), now: () => new Date() }
        const id = `x-${randomUUID().slice(0, 8)}`
        try {
          await call(deps, req('cy', 'note.list'))
          const stranger = `stranger-${id}`
          await expect(call(deps, req(stranger, 'note.add', { id, body: 'hi' }))).rejects.toThrow(
            /no access/,
          )
          await expect(call(deps, req('eve', 'note.add', { id, body: 'hi' }))).rejects.toThrow(
            /loadout/,
          )
          expect(w.oneTrip()).toBe(2)
        } finally {
          await w.close()
        }
        expect(await db.query('select 1 from toy.notes where id = $1', [id])).toEqual([])
        const logged = await db.query<{ principal: string; status: number; code: string }>(
          `select principal, status, code from packs.op_calls
         where op = 'note.add' and input ->> 'id' = $1 order by id`,
          [id],
        )
        expect(logged).toEqual([
          { principal: `stranger-${id}`, status: 403, code: 'NO_ACCOUNT' },
          { principal: 'eve', status: 403, code: 'FORBIDDEN' },
        ])
      })

      it("runs an agent's call under its person, and only while both hold the move", async () => {
        const fay = `fay-${tag}`
        const agent = `${fay}-agent`
        await addPrincipal(db, fay)
        await setLoadout(db, fay, 'toy', Object.keys(pack.ops))
        await addPrincipal(db, agent, fay)
        await setLoadout(db, agent, 'toy', Object.keys(pack.ops))
        const w = watched()
        const deps = { ...depsOf(w.db), now: () => new Date() }
        try {
          await call(deps, req(fay, 'note.list'))
          await call(deps, req(agent, 'note.add', { id: `${fay}-1`, body: 'from the agent' }))
          const [row] = await db.query('select owner from toy.notes where id = $1', [`${fay}-1`])
          expect(row).toEqual({ owner: fay })
          expect(await call(deps, req(agent, 'note.list'))).toEqual([
            { id: `${fay}-1`, body: 'from the agent' },
          ])
          await setLoadout(db, fay, 'toy', ['note.add'])
          await expect(call(deps, req(agent, 'note.list'))).rejects.toThrow(/loadout/)
          await setLoadout(db, fay, 'toy', Object.keys(pack.ops))
          await setLoadout(db, agent, 'toy', ['note.add'])
          await expect(call(deps, req(agent, 'note.list'))).rejects.toThrow(/loadout/)
          expect(w.oneTrip()).toBe(4)
        } finally {
          await w.close()
        }
        const logged = await db.query<{ agent_of: string | null }>(
          'select agent_of from packs.op_calls where principal = $1 order by id',
          [agent],
        )
        expect(logged.map((r) => r.agent_of)).toEqual([fay, fay, null, null])
      })

      it('claims the key, then runs the rules and the move as pack_runtime, in one first trip', async () => {
        await keyedVersion()
        const w = watched()
        const deps = { ...depsOf(w.db), environment: 'keyed', now: () => new Date() }
        const id = `k-${randomUUID().slice(0, 8)}`
        const key = `key-${id}`
        const add = { ...req('gus', 'note.add', { id, body: 'once' }), key }
        try {
          await call(deps, req('gus', 'note.list'))
          expect(await call(deps, add)).toEqual({ id, body: 'once' })
          // The same call again is answered from the key, past the rule, not run twice.
          expect(await call(deps, add)).toEqual({ id, body: 'once' })
          expect(w.oneTrip()).toBe(2)
        } finally {
          await w.close()
        }
        const claimed = await db.query(
          `select result from packs.idempotency where principal = 'gus' and key = $1`,
          [key],
        )
        expect(claimed).toEqual([{ result: { id, body: 'once' } }])
        expect(await db.query('select id from toy.notes where id = $1', [id])).toHaveLength(1)
        const logged = await db.query<{ status: number }>(
          `select status from packs.op_calls where input ->> 'id' = $1`,
          [id],
        )
        expect(logged).toEqual([{ status: 200 }, { status: 200 }])
      })

      it('reads in two trips, the rules and the move in the first, and saves them once per connection', async () => {
        await readsVersion()
        const ida = `ida-${tag}`
        await addPrincipal(db, ida)
        await setLoadout(db, ida, 'toy', ['touch.read'])
        const w = watched(1)
        const deps = { ...depsOf(w.db), environment: 'reads', now: () => new Date() }
        const trips: string[] = []
        const sent = pg.Client.prototype.query
        try {
          // The first call admits ida; the second saves the statements on the connection.
          await call(deps, touch(ida, { open: true, n: '1' }))
          await call(deps, touch(ida, { open: true, n: '1' }))
          pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
            const q = args[0] as string | { text: string }
            trips.push(typeof q === 'string' ? q : q.text)
            return (sent as (...a: unknown[]) => unknown).apply(this, args)
          } as typeof sent
          expect(await call(deps, touch(ida, { open: true, n: '1' }))).toBe(1)
        } finally {
          pg.Client.prototype.query = sent
          await w.close()
        }
        expect(trips).toHaveLength(2)
        expect(trips[0]).toContain('packs.judge')
        expect(trips[0]).not.toContain('prepare one_')
        expect(trips[0]).toContain(prepare ? 'execute one_' : 'toy.touch(')
        expect(trips[1]).toMatch(/commit$/)
        expect(w.oneRead()).toBe(2)
      })

      it('refuses in the first trip, commits nothing the read would have written, and logs each refusal once', async () => {
        await readsVersion()
        const [jo, bare, gone] = ['jo', 'kim', 'ned'].map((p) => `${p}-${tag}`) as [
          string,
          string,
          string,
        ]
        const agent = `${jo}-agent`
        for (const p of [jo, bare, gone]) await addPrincipal(db, p)
        await addPrincipal(db, agent, jo)
        await setLoadout(db, jo, 'toy', ['note.list', 'touch.read'])
        await setLoadout(db, gone, 'toy', ['note.list', 'touch.read'])
        await setLoadout(db, bare, 'toy', ['note.list'])
        await setLoadout(db, agent, 'toy', ['note.list'])
        const id = randomUUID().slice(0, 8)
        const w = watched(1)
        const deps = { ...depsOf(w.db), environment: 'reads', now: () => new Date() }
        const refusal = (who: string, input: { open: boolean; n: string }) =>
          call(deps, touch(who, { ...input, tag: id })).then(
            () => null,
            (e: Refused) => ({
              status: e.status,
              code: e.code,
              message: e.message,
              d: { rule: e.rule, details: e.details },
            }),
          )
        try {
          // Each is admitted once, so the calls below go in one trip.
          for (const p of [jo, bare, gone, agent]) await call(deps, req(p, 'note.list'))
          await db.query('delete from packs.loadouts where principal = $1', [gone])
          await db.query('delete from packs.principals where id = $1', [gone])
          expect(await refusal(bare, { open: true, n: '1' })).toMatchObject({
            status: 403,
            code: 'FORBIDDEN',
          })
          // The agent lacks the move; its person holds it.
          expect(await refusal(agent, { open: true, n: '1' })).toMatchObject({
            status: 403,
            code: 'FORBIDDEN',
          })
          expect(await refusal(gone, { open: true, n: '1' })).toMatchObject({
            status: 403,
            code: 'NO_ACCOUNT',
          })
          expect(await refusal(jo, { open: false, n: '1' })).toEqual({
            status: 409,
            code: 'GATE_SHUT',
            message: 'the gate is shut',
            d: { rule: 'gate.open', details: { open: false } },
          })
          // The move runs, writes through the function, then fails: all of it is undone.
          expect(await refusal(jo, { open: true, n: '0' })).toMatchObject({
            status: 400,
            code: 'BAD_INPUT',
          })
          // Input that is not valid, from a caller without the move: the loadout answers first.
          expect(await refusal(bare, { open: true, n: 'x' })).toMatchObject({
            status: 403,
            code: 'FORBIDDEN',
          })
          expect(w.oneRead()).toBe(5)
          // The one connection still answers.
          expect(await call(deps, touch(jo, { open: true, n: '1', tag: id }))).toBe(1)
        } finally {
          await w.close()
        }
        const touched = await db.query<{ who: string }>(
          'select who from toy.touched where who = any($1)',
          [[jo, bare, gone, agent]],
        )
        expect(touched).toEqual([{ who: jo }])
        const logged = await db.query<{ principal: string; status: number; code: string | null }>(
          `select principal, status, code from packs.op_calls
           where op = 'touch.read' and input ->> 'tag' = $1 order by id`,
          [id],
        )
        expect(logged).toEqual([
          { principal: bare, status: 403, code: 'FORBIDDEN' },
          { principal: agent, status: 403, code: 'FORBIDDEN' },
          { principal: gone, status: 403, code: 'NO_ACCOUNT' },
          { principal: jo, status: 409, code: 'GATE_SHUT' },
          { principal: jo, status: 400, code: 'BAD_INPUT' },
          { principal: bare, status: 403, code: 'FORBIDDEN' },
          { principal: jo, status: 200, code: null },
        ])
      })

      it('answers input with a NUL byte as bad input, as before, not as a fault', async () => {
        await readsVersion()
        const pia = `pia-${tag}`
        await addPrincipal(db, pia)
        await setLoadout(db, pia, 'toy', ['note.list', 'touch.read'])
        const w = watched()
        const deps = { ...depsOf(w.db), environment: 'reads', now: () => new Date() }
        try {
          await call(deps, req(pia, 'note.list'))
          const err = await call(deps, touch(pia, { open: true, n: '1', tag: 'a\u0000b' })).catch(
            (e: unknown) => e,
          )
          expect(err).toMatchObject({ status: 400, code: 'BAD_INPUT' })
          // It went the way that sends values as parameters.
          expect(w.oneRead()).toBe(0)
        } finally {
          await w.close()
        }
      })

      it("goes the long way when an agent's person changed since this process saw it", async () => {
        await readsVersion()
        const [lu, mo] = ['lu', 'mo'].map((p) => `${p}-${tag}`) as [string, string]
        const bot = `${lu}-bot`
        for (const p of [lu, mo]) {
          await addPrincipal(db, p)
          await setLoadout(db, p, 'toy', ['note.list', 'touch.read'])
        }
        await addPrincipal(db, bot, lu)
        await setLoadout(db, bot, 'toy', ['note.list', 'touch.read'])
        const w = watched()
        const deps = { ...depsOf(w.db), environment: 'reads', now: () => new Date() }
        try {
          await call(deps, req(bot, 'note.list'))
          await call(deps, touch(bot, { open: true, n: '1' }))
          await db.query('update packs.principals set agent_of = $1 where id = $2', [mo, bot])
          await call(deps, touch(bot, { open: true, n: '1' }))
          // Both tried the one trip; the second was refused as stale and ran under its new person.
          expect(w.oneRead()).toBe(2)
        } finally {
          await w.close()
        }
        const touched = await db.query<{ who: string }>(
          'select who from toy.touched where who = any($1)',
          [[lu, mo, bot]],
        )
        expect(touched.map((t) => t.who)).toEqual([lu, mo])
      })

      it('never sends a statement that leaves a quote open among its own, even from a version published before the check', async () => {
        await readsVersion()
        // As a version published before `sqlProblem` refused an open quote: straight into the
        // registry. Among the core's text the quote would end at the next value's tag, and the
        // caller's value would run as SQL, as the login role.
        const version = prepare ? '1.4.0' : '1.4.1'
        const environment = `quotes-${tag}`
        const v = toyPack(version)
        v.rules['open.quote'] = {
          id: 'open.quote',
          sql: 'select $v$',
          status: 409,
          code: 'OPEN',
          message: 'open',
        }
        v.ops['quote.read'] = {
          name: 'quote.read',
          description: 'Answers what it is given, past a rule that leaves a quote open.',
          input: {
            type: 'object',
            additionalProperties: false,
            required: ['q'],
            properties: { q: { type: 'string' } },
          },
          sql: 'select :q as result',
          returns: 'many',
          before: ['open.quote'],
        }
        await db.query(
          `insert into packs.pack_versions (pack, version, content, content_hash, published_by)
           values ('toy', $1, $2, $3, $4)`,
          [version, JSON.stringify(v), hashOf(v), OWNER],
        )
        await recordTestRun(db, {
          pack: 'toy',
          version,
          hash: hashOf(v),
          passed: true,
          results: [],
        })
        await promote(db, { actor: OWNER, environment, pack: 'toy', version })
        const ola = `ola-${tag}`
        await addPrincipal(db, ola)
        await setLoadout(db, ola, 'toy', ['note.list', 'quote.read'])
        const marker = `pwned-${tag}`
        const q = `x, true as ok) as rule limit 1) as r on true; reset role;
          insert into toy.touched values ('${marker}'); select 1 as result --`
        const w = watched(1)
        const deps = { ...depsOf(w.db), environment, now: () => new Date() }
        try {
          await call(deps, req(ola, 'note.list'))
          // The rule runs alone, the old way, and fails as a statement: the value stays a value.
          await expect(call(deps, { ...req(ola, 'quote.read', { q }) })).rejects.toThrow()
          expect(w.oneRead()).toBe(0)
        } finally {
          await w.close()
        }
        expect(await db.query('select 1 from toy.touched where who = $1', [marker])).toEqual([])
      })
    },
  )

  // What only named statements meet: a plan kept past a change, and a server that lost them.
  describe('a call with named statements', () => {
    const watched = (max = 5) => watchedPool(true, max)

    it('answers after a table it read gains a column, whether or not its columns change', async () => {
      await db.exec(`create table toy.wide (id text primary key);
      grant select on toy.wide to pack_runtime;
      insert into toy.wide values ('w1')`)
      const one = openPostgres(dbUrl, 1, { prepare: true })
      const d = { db: one, now: () => new Date() }
      const caller = { principal: 'cy', person: 'cy', agent: null }
      const named = { ...pack.ops['note.list']!, sql: 'select id from toy.wide' }
      const star = { ...pack.ops['note.list']!, sql: 'select * from toy.wide' }
      try {
        expect(await execute(d, pack, named, caller, {})).toEqual([{ id: 'w1' }])
        expect(await execute(d, pack, star, caller, {})).toEqual([{ id: 'w1' }])
        await db.exec(`alter table toy.wide add column more text default 'm'`)
        expect(await execute(d, pack, named, caller, {})).toEqual([{ id: 'w1' }])
        // `select *` now answers another shape: Postgres refuses the old plan, and the call runs
        // once more under a new name.
        expect(await execute(d, pack, star, caller, {})).toEqual([{ id: 'w1', more: 'm' }])
        expect(await execute(d, pack, star, caller, {})).toEqual([{ id: 'w1', more: 'm' }])
      } finally {
        await one.close()
      }
    })

    it('answers once more on a fresh connection when the server dropped its statements', async () => {
      await addPrincipal(db, 'lou')
      await setLoadout(db, 'lou', 'toy', Object.keys(pack.ops))
      const w = watched(1)
      const deps = { ...depsOf(w.db), now: () => new Date() }
      const id = `l-${randomUUID().slice(0, 8)}`
      try {
        await call(deps, req('lou', 'note.list'))
        await call(deps, req('lou', 'note.add', { id: `${id}-a`, body: 'before' }))
        // As a pooler that hands the next call another session would: node-pg still thinks the
        // statements are there.
        await w.db.exec('deallocate all')
        expect(await call(deps, req('lou', 'note.add', { id: `${id}-b`, body: 'after' }))).toEqual({
          id: `${id}-b`,
          body: 'after',
        })
        expect(await call(deps, req('lou', 'note.list'))).toContainEqual({
          id: `${id}-b`,
          body: 'after',
        })
      } finally {
        await w.close()
      }
      expect(await db.query('select id from toy.notes where id = $1', [`${id}-b`])).toHaveLength(1)
      const logged = await db.query<{ status: number }>(
        `select status from packs.op_calls where input ->> 'id' = $1`,
        [`${id}-b`],
      )
      expect(logged).toEqual([{ status: 200 }])
    })

    it('writes once when a keyed write is run again after its table changed shape', async () => {
      await keyedVersion()
      const w = watched(1)
      const deps = { ...depsOf(w.db), environment: 'keyed', now: () => new Date() }
      const id = `t-${randomUUID().slice(0, 8)}`
      try {
        await call(deps, { ...req('gus', 'tall.add', { id: `${id}-a` }), key: `key-${id}-a` })
        await db.exec(`alter table toy.tall add column extra text default 'x'`)
        // `returning *` now answers another shape: the first try fails and rolls back.
        expect(
          await call(deps, {
            ...req('gus', 'tall.add', { id: `${id}-b` }),
            key: `key-${id}-b`,
          }),
        ).toEqual({ id: `${id}-b`, owner: 'gus', extra: 'x' })
        // The second call went in one first trip; the second run happens inside `Db.transaction`.
        expect(w.oneTrip()).toBe(1)
      } finally {
        await w.close()
      }
      expect(await db.query('select id from toy.tall where id = $1', [`${id}-b`])).toHaveLength(1)
      expect(
        await db.query('select key from packs.idempotency where key = $1', [`key-${id}-b`]),
      ).toHaveLength(1)
      const logged = await db.query<{ status: number }>(
        `select status from packs.op_calls where input ->> 'id' = $1`,
        [`${id}-b`],
      )
      expect(logged).toEqual([{ status: 200 }])
    })
  })
})
