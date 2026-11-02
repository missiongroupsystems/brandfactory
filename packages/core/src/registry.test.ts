import { afterEach, describe, expect, it } from 'vitest'
import { principalClaimsSql, writeClaims } from './claims'
import { type Conn, type Db } from './db'
import { Refused } from './errors'
import { hashOf } from './pack'
import { migrateCore } from './migrate'
import { addPrincipal, liveVersion, promote, publish, recordTestRun } from './registry'
import { execute } from './run'
import { forbiddenFunction } from './sql'
import { freshDb, goLive, OWNER } from './testing'
import { toyPack } from './toy-pack'

const open: Db[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()))
})

async function db() {
  const d = await freshDb()
  open.push(d)
  await addPrincipal(d, OWNER)
  return d
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'OK',
    (e: unknown) => (e instanceof Refused ? e.code : String(e)),
  )

describe('the live pointer', () => {
  it('will not move to a version with no passing test run', async () => {
    const d = await db()
    const v1 = toyPack('1.0.0')
    await publish(d, v1, OWNER)
    const to = { actor: OWNER, environment: 'local', pack: 'toy', version: '1.0.0' }
    expect(await code(promote(d, to))).toBe('NO_PASSING_RUN')
    await recordTestRun(d, {
      pack: 'toy',
      version: '1.0.0',
      hash: hashOf(v1),
      passed: false,
      results: [],
    })
    expect(await code(promote(d, to))).toBe('NO_PASSING_RUN')
    expect(await liveVersion(d, 'local', 'toy')).toBeNull()
  })

  it('takes a run only for the exact content of the version it names', async () => {
    const d = await db()
    await publish(d, toyPack('1.0.0'), OWNER)
    const other = toyPack('1.0.0', { ontology: 'different' })
    const run = { pack: 'toy', version: '1.0.0', hash: hashOf(other), passed: true, results: [] }
    await expect(recordTestRun(d, run)).rejects.toThrow(/hash/)
    const to = { actor: OWNER, environment: 'local', pack: 'toy', version: '1.0.0' }
    expect(await code(promote(d, to))).toBe('NO_PASSING_RUN')
  })

  it('says so when the version does not exist', async () => {
    const d = await db()
    const to = { actor: OWNER, environment: 'local', pack: 'toy', version: '9.9.9' }
    expect(await code(promote(d, to))).toBe('NO_VERSION')
  })

  it('moves only for a person, never for an agent or an unknown id', async () => {
    const d = await db()
    const v1 = toyPack('1.0.0')
    await publish(d, v1, OWNER)
    await recordTestRun(d, {
      pack: 'toy',
      version: '1.0.0',
      hash: hashOf(v1),
      passed: true,
      results: [],
    })
    await addPrincipal(d, 'bot', OWNER)
    const to = { environment: 'local', pack: 'toy', version: '1.0.0' }
    expect(await code(promote(d, { ...to, actor: 'bot' }))).toBe('NOT_A_PERSON')
    expect(await code(promote(d, { ...to, actor: 'nobody' }))).toBe('NOT_A_PERSON')
    expect(await code(promote(d, { ...to, actor: OWNER }))).toBe('OK')
    expect((await liveVersion(d, 'local', 'toy'))?.version).toBe('1.0.0')
  })

  it('moves back to an earlier version that passed', async () => {
    const d = await db()
    await goLive(d, toyPack('1.0.0'))
    const v2 = toyPack('1.1.0')
    await publish(d, v2, OWNER)
    await recordTestRun(d, {
      pack: 'toy',
      version: '1.1.0',
      hash: hashOf(v2),
      passed: true,
      results: [],
    })
    const to = { actor: OWNER, environment: 'local', pack: 'toy' }
    await promote(d, { ...to, version: '1.1.0' })
    expect((await liveVersion(d, 'local', 'toy'))?.version).toBe('1.1.0')
    await promote(d, { ...to, version: '1.0.0' })
    expect((await liveVersion(d, 'local', 'toy'))?.version).toBe('1.0.0')
  })
})

describe('a published version', () => {
  it('never changes, and its name is never reused', async () => {
    const d = await db()
    await publish(d, toyPack('1.0.0'), OWNER)
    await expect(
      d.query(`update packs.pack_versions set content = '{}' where version = '1.0.0'`),
    ).rejects.toThrow(/never change/)
    await expect(d.query(`delete from packs.pack_versions`)).rejects.toThrow(/never change/)
    expect(await code(publish(d, toyPack('1.0.0', { ontology: 'x' }), OWNER))).toBe(
      'VERSION_EXISTS',
    )
  })

  it('is refused when a name would not survive as an MCP tool name', async () => {
    const d = await db()
    const bad = toyPack()
    bad.ops['note.list'] = { ...bad.ops['note.list']!, name: 'note__list' }
    bad.ops = { note__list: bad.ops['note.list']!, ...bad.ops }
    delete bad.ops['note.list']
    expect(await code(publish(d, bad, OWNER))).toBe('INVALID_PACK')
  })

  it('is refused when a move fails the SQL check', async () => {
    const d = await db()
    const bad = toyPack()
    bad.ops['note.list']!.sql = "select set_config('app.user_id', 'ben', true)"
    expect(await code(publish(d, bad, OWNER))).toBe('INVALID_PACK')
  })
})

describe('the claims of a call (migration 0011)', () => {
  const claimsNow = (tx: { query: Db['query'] }) =>
    tx.query<{ user_id: string; pack: string; known: boolean }>(
      `select user_id, pack, known from claims.calls where xact = pg_current_xact_id_if_assigned()`,
    )

  it('are written once: the same again changes nothing, others are refused and change nothing', async () => {
    const d = await db()
    const out = await d.transaction(async (tx) => {
      await writeClaims(tx, { user_id: 'ana', pack: 'toy' })
      await writeClaims(tx, { user_id: 'ana', pack: 'toy' })
      for (const other of [
        { user_id: 'ben', pack: 'toy' },
        { user_id: 'ana', pack: 'other' },
      ]) {
        await tx.exec('savepoint s')
        await expect(writeClaims(tx, other)).rejects.toThrow(/already written/)
        await tx.exec('rollback to savepoint s')
      }
      return claimsNow(tx)
    })
    expect(out).toEqual([{ user_id: 'ana', pack: 'toy', known: true }])
  })

  it('stay when a statement fires deferred triggers early, which once removed them', async () => {
    const d = await db()
    const out = await d.transaction(async (tx) => {
      await writeClaims(tx, { user_id: 'ana', pack: 'toy' })
      await tx.exec('set local role pack_runtime')
      await tx.exec('set constraints all immediate')
      await tx.exec('reset role')
      return claimsNow(tx)
    })
    expect(out).toEqual([{ user_id: 'ana', pack: 'toy', known: true }])
  })

  it('mark an unknown principal, and leave no room for another open after it', async () => {
    const d = await db()
    const out = await d.transaction(async (tx) => {
      await tx.query(principalClaimsSql('nobody', 'toy'))
      await tx.exec('savepoint s')
      await expect(writeClaims(tx, { user_id: 'ana', pack: 'toy' })).rejects.toThrow(
        /already written/,
      )
      await tx.exec('rollback to savepoint s')
      return claimsNow(tx)
    })
    expect(out).toEqual([{ user_id: '', pack: 'toy', known: false }])
  })

  it('go in the purge once their transaction ends, and not before', async () => {
    const d = await db()
    await d.transaction((tx) => writeClaims(tx, { user_id: 'ana', pack: 'toy' }))
    const during = await d.transaction(async (tx) => {
      await writeClaims(tx, { user_id: 'ben', pack: 'toy' })
      await tx.query('select claims.purge()')
      return claimsNow(tx)
    })
    expect(during).toEqual([{ user_id: 'ben', pack: 'toy', known: true }])
    await d.query('select claims.purge()')
    expect(await d.query(`select count(*)::int as n from claims.calls`)).toEqual([{ n: 0 }])
  })
})

describe('the call path functions (migration 0012)', () => {
  // Inside a call, as SQL that escaped to the login role would be.
  const inCall = <T>(d: Db, fn: (tx: Conn) => Promise<T>, who = 'ana', pack = 'toy') =>
    d.transaction(async (tx) => {
      await writeClaims(tx, { user_id: who, pack })
      return fn(tx)
    })
  const refusal = (p: Promise<unknown>) =>
    p.then(
      () => 'OK',
      (e: unknown) => String((e as Error).message),
    )

  it.each([
    ['look up a principal', `select * from packs.who('ben', 'toy', 'note.list')`],
    ['read the live pointer', `select * from packs.live_version('test', 'toy')`],
    ['read a version', `select packs.version_content('x')`],
  ])('refuse to %s inside a call, and allow it outside', async (_, sql) => {
    const d = await db()
    await goLive(d, toyPack())
    expect(await refusal(inCall(d, (tx) => tx.query(sql)))).toMatch(/not inside a call/)
    expect(await refusal(d.query(sql))).toBe('OK')
  })

  it('keep idempotency keys to the call’s own principal and pack', async () => {
    const d = await db()
    await d.query(
      `insert into packs.idempotency (principal, pack, op, key, input_hash, result)
       values ('ben', 'toy', 'note.add', 'k-0000001', 'h', '"bens answer"')`,
    )
    const seen = await inCall(d, (tx) =>
      tx.query<{ fresh: boolean; result: unknown }>(
        `select fresh, result from packs.key_start('note.add', 'k-0000001', 'h')`,
      ),
    )
    // Ana's own key, fresh: never Ben's answer.
    expect(seen).toEqual([{ fresh: true, result: null }])
    await inCall(d, (tx) => tx.query(`select packs.key_done('note.add', 'k-0000001', '"x"')`))
    const [bens] = await d.query<{ result: unknown }>(
      `select result from packs.idempotency where principal = 'ben'`,
    )
    expect(bens!.result).toBe('bens answer')
  })

  it('log inside a call only as its own principal and pack, and anything outside one', async () => {
    const d = await db()
    const logAs = (principal: string, pack: string) =>
      `select packs.log_call('${principal}', null, '${pack}', '1.0.0', 'note.add', null, 200, null)`
    expect(await refusal(inCall(d, (tx) => tx.query(logAs('ben', 'toy'))))).toBe('OK')
    expect(await refusal(inCall(d, (tx) => tx.query(logAs('ana', 'other'))))).toMatch(/log/)
    expect(await refusal(d.query(logAs('ben', 'other')))).toBe('OK')
    // Inside Ana's call, a row that names Ben is logged as Ana's.
    expect(await d.query(`select principal, pack from packs.op_calls order by id`)).toEqual([
      { principal: 'ana', pack: 'toy' },
      { principal: 'ben', pack: 'other' },
    ])
  })

  it('judge a call only for its own pack, and a row with no pack as the code before 0011 wrote it', async () => {
    const d = await db()
    await goLive(d, toyPack())
    const judge = (pack: string, claimsPack: string) =>
      refusal(
        inCall(
          d,
          (tx) => tx.query(`select packs.judge('local', '${pack}', 'note.list', 'x', null)`),
          'ana',
          claimsPack,
        ),
      )
    expect(await judge('other', 'toy')).toMatch(/not this call's pack/)
    // Past the pack check: the stale hash is the next refusal.
    expect(await judge('toy', 'toy')).toMatch(/core_refused/)
    expect(await judge('toy', '')).toMatch(/core_refused/)
  })

  it('check a call only for its own pack', async () => {
    const d = await db()
    await goLive(d, toyPack())
    const check = (pack: string) =>
      inCall(d, (tx) => tx.query(`select * from packs.call_check('test', '${pack}', 'note.list')`))
    expect(await refusal(check('toy'))).toBe('OK')
    expect(await refusal(check('other'))).toMatch(/pack/)
  })

  it.each([
    ['claim a due timed call', `select * from packs.claim_due(now())`],
    ['beat for a timed call', `select packs.call_beat(1, now())`],
    ['end a timed call', `select packs.call_end(1, 'done', null, null, now())`],
    ['mark stuck calls', `select * from packs.calls_stuck(now(), now())`],
    ['alert a principal', `select packs.alert('ben', 'toy', null, 'x')`],
    ['read a follow-up move', `select packs.follow_op('local', 'toy', 'onRefused')`],
    ['record a send’s outcome', `select packs.approval_outcome(1, '{}')`],
    ['start an agent', `select packs.start_agent('ben', 'helper')`],
    ['ask whether a principal exists', `select packs.is_principal('ben')`],
  ])('refuse to %s inside a call', async (_, sql) => {
    const d = await db()
    expect(await refusal(inCall(d, (tx) => tx.query(sql)))).toMatch(/not inside a call/)
  })

  it('schedule and approve only for the call’s own principal and pack', async () => {
    const d = await db()
    await goLive(d, toyPack())
    await d.exec(`insert into packs.principals (id) values ('ana') on conflict do nothing;
      insert into packs.loadouts (principal, pack, ops) values ('ana', 'toy', '{note.add}')
      on conflict (principal, pack) do update set ops = excluded.ops`)
    await inCall(d, async (tx) => {
      await tx.query(
        `select packs.schedule('{note.add}', '[{"op":"note.add","key":"k1","input":{},"at":"2030-01-01T00:00:00Z"}]')`,
      )
      await tx.query(`select * from packs.approval_store('note.add', 'h', 60)`)
    })
    expect(await d.query(`select principal, pack from packs.scheduled_calls`)).toEqual([
      { principal: 'ana', pack: 'toy' },
    ])
    expect(await d.query(`select approved_by, pack from packs.approvals`)).toEqual([
      { approved_by: 'ana', pack: 'toy' },
    ])
  })

  it('schedule only moves the caller holds, whatever it lists, and nothing for a guest', async () => {
    const d = await db()
    await goLive(d, toyPack())
    await d.exec(`insert into packs.principals (id) values ('ana'), ('bob') on conflict do nothing;
      insert into packs.loadouts (principal, pack, ops) values ('ana', 'toy', '{note.drop}'),
        ('bob', 'toy', '{note.list}') on conflict (principal, pack) do update set ops = excluded.ops`)
    const ask = (input: string) =>
      `select packs.schedule('{}', '[{"op":"note.drop","key":"k1","input":${input},"at":"2030-01-01T00:00:00Z"}]') as missing`
    await inCall(d, (tx) => tx.query(ask('{"id":"anas"}')))
    // Bob lists nothing as needed and asks for Ana's move under her key: refused, unchanged.
    const bobs = await inCall(
      d,
      (tx) => tx.query<{ missing: string[] }>(ask('{"id":"bobs"}')),
      'bob',
    )
    expect(bobs).toEqual([{ missing: ['note.drop'] }])
    expect(await refusal(inCall(d, (tx) => tx.query(ask('{"id":"x"}')), ''))).toMatch(/guest/)
    expect(await d.query(`select principal, input from packs.scheduled_calls`)).toEqual([
      { principal: 'ana', input: { id: 'anas' } },
    ])
  })

  it('store and use a yes only for a caller who holds the move', async () => {
    const d = await db()
    await d.exec(`insert into packs.principals (id) values ('ana'), ('bob') on conflict do nothing;
      insert into packs.loadouts (principal, pack, ops) values ('ana', 'toy', '{note.share}'),
        ('bob', 'toy', '{note.list}') on conflict (principal, pack) do update set ops = excluded.ops`)
    await inCall(d, (tx) => tx.query(`select * from packs.approval_store('note.share', 'h', 60)`))
    // Bob, who lacks the move, gets no yes and spends none.
    expect(
      await inCall(
        d,
        (tx) => tx.query(`select packs.approval_use('note.share', 'h') as id`),
        'bob',
      ),
    ).toEqual([{ id: null }])
    expect(
      await refusal(
        inCall(
          d,
          (tx) => tx.query(`select * from packs.approval_store('note.share', 'h', 60)`),
          'bob',
        ),
      ),
    ).toMatch(/does not hold/)
    expect(await d.query(`select used_by from packs.approvals`)).toEqual([{ used_by: null }])
  })

  it('keep working when a temporary table is named like a type', async () => {
    const d = await db()
    const out = await inCall(d, async (tx) => {
      await tx.exec('create temporary table text (x int); create temporary table jsonb (x int)')
      return tx.query<{ fresh: boolean }>(
        `select fresh from packs.key_start('note.add', 'k-0000002', 'h')`,
      )
    })
    expect(out).toEqual([{ fresh: true }])
  })
})

describe('the runtime role', () => {
  // A statement that slipped past the SQL check still meets the database's own wall.
  const raw = async (sql: string) => {
    const d = await db()
    await goLive(d, toyPack())
    const pack = toyPack()
    const op = { ...pack.ops['note.list']!, sql }
    const caller = { principal: 'ana', person: 'ana', agent: null }
    return execute({ db: d, now: () => new Date() }, pack, op, caller, {})
  }

  it.each([
    ['change its own claims', "select set_config('app.user_id', 'ben', true) as x"],
    ['sleep', 'select pg_sleep(0) as x'],
    ['read the registry', 'select count(*) from packs.pack_versions'],
    [
      'write a test run',
      `insert into packs.test_runs (pack, version, version_hash, passed, results) values ('toy', '1.0.0', 'x', true, '[]') returning id`,
    ],
    ['take an advisory lock', 'select pg_advisory_lock(1) as x'],
    ['run XML queries', `select query_to_xml('select 1', true, true, '') as x`],
  ])('cannot %s', async (_what, sql) => {
    await expect(raw(sql)).rejects.toThrow(/permission denied/)
  })

  it('keeps its caller where it may call set_config, as on Supabase', async () => {
    // Supabase's login role cannot take set_config from PUBLIC. The caller must still hold:
    // the row rules read the core's claims table, which the runtime role cannot write.
    const d = await db()
    await goLive(d, toyPack())
    await d.exec(`
      grant execute on function pg_catalog.set_config(text, text, boolean) to pack_runtime;
      insert into toy.notes (id, owner, body) values ('a1', 'ana', 'mine'), ('b1', 'ben', 'his');
    `)
    const seen = await d.transaction(async (tx) => {
      await writeClaims(tx, { user_id: 'ana' })
      await tx.exec('set local role pack_runtime')
      await tx.query(`select set_config('app.user_id', 'ben', true)`)
      const writes: string[] = []
      for (const sql of [
        `insert into claims.calls (user_id) values ('ben')`,
        `update claims.calls set user_id = 'ben'`,
        `delete from claims.calls`,
      ]) {
        await tx.exec('savepoint s')
        writes.push(await code(tx.query(sql)))
        await tx.exec('rollback to savepoint s')
      }
      return {
        writes,
        who: await tx.query(`select claims.user_id() as who`),
        notes: await tx.query(`select id from toy.notes`),
      }
    })
    expect(seen.who).toEqual([{ who: 'ana' }])
    expect(seen.notes).toEqual([{ id: 'a1' }])
    expect(seen.writes.every((w) => /permission denied/.test(w))).toBe(true)
    // The row stays until the scheduler's purge (migration 0011), then goes: nothing removes it
    // while its transaction runs.
    expect(await d.query(`select count(*)::int as n from claims.calls`)).not.toEqual([{ n: 0 }])
    await d.query('select claims.purge()')
    expect(await d.query(`select count(*)::int as n from claims.calls`)).toEqual([{ n: 0 }])
  })

  it('cannot call any function the SQL check forbids', async () => {
    const d = await db()
    const rows = await d.query<{ name: string; can: boolean }>(
      `select p.proname as name, has_function_privilege('pack_runtime', p.oid, 'execute') as can
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'pg_catalog'`,
    )
    const forbidden = rows.filter((r) => forbiddenFunction(r.name))
    expect(forbidden.length).toBeGreaterThan(20)
    expect(forbidden.filter((r) => r.can).map((r) => r.name)).toEqual([])
  })

  it('cannot leave its role from inside a statement', async () => {
    // A top-level RESET ROLE is the SQL check's to refuse (sql.test.ts); inside a statement the
    // only way out is set_config, which the role cannot call.
    await expect(raw("select set_config('role', 'postgres', true) as x")).rejects.toThrow(
      /permission denied/,
    )
    const d = await db()
    await goLive(d, toyPack())
    const pack = toyPack()
    const who = await execute(
      { db: d, now: () => new Date() },
      pack,
      { ...pack.ops['note.list']!, sql: 'select current_user as who', returns: 'one' },
      { principal: 'ana', person: 'ana', agent: null },
      {},
    )
    expect(who).toEqual({ who: 'pack_runtime' })
  })
})

describe('core migrations rewritten after they ran', () => {
  it('count as applied under their earlier text, and refuse any other change', async () => {
    const d = await freshDb()
    open.push(d)
    // 0001 as it ran on Fly before its superuser guard: the same migration.
    await d.query(`update packs.migrations set hash = $1 where name = '0001_registry.sql'`, [
      'debeea582024c6d3df3e3581a499ec468357ff122b110075b994d20a31288396',
    ])
    expect(await migrateCore(d)).toEqual([])
    await d.query(`update packs.migrations set hash = 'x' where name = '0001_registry.sql'`)
    await expect(migrateCore(d)).rejects.toThrow(/0001_registry.sql changed after it ran/)
  })
})
