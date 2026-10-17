import { afterEach, describe, expect, it } from 'vitest'
import { type Db } from './db'
import { Refused } from './errors'
import { hashOf } from './pack'
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

  it('is refused when a move fails the SQL check', async () => {
    const d = await db()
    const bad = toyPack()
    bad.ops['note.list']!.sql = "select set_config('app.user_id', 'ben', true)"
    expect(await code(publish(d, bad, OWNER))).toBe('INVALID_PACK')
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
