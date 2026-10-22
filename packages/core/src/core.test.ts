import { afterEach, describe, expect, it } from 'vitest'
import { createCore } from './app'
import { type Db } from './db'
import { hashOf } from './pack'
import { addPrincipal, promote, publish, recordTestRun, setLoadout } from './registry'
import { deps, freshDb, goLive, OWNER, person } from './testing'
import { toyPack } from './toy-pack'

const open: Db[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()))
})

async function setup() {
  const db = await freshDb()
  open.push(db)
  const pack = toyPack()
  await goLive(db, pack)
  await person(db, 'ana', pack)
  await person(db, 'ben', pack)
  const app = createCore(deps(db))
  async function call(op: string, input?: unknown, token: string | null = 'ana') {
    const res = await app.request(`/ops/toy/${op}`, {
      method: 'POST',
      headers: { ...(token && { authorization: `Bearer ${token}` }) },
      body: input === undefined ? undefined : JSON.stringify(input),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    return { status: res.status, data }
  }
  const lastLog = async () =>
    (
      await db.query<{ principal: string; op: string; status: number; code: string | null }>(
        'select principal, op, status, code from packs.op_calls order by id desc limit 1',
      )
    )[0]
  return { app, db, call, lastLog, pack }
}

describe('a call through the core', () => {
  it('runs a write move and a read move end to end, each under its caller', async () => {
    const { call, lastLog } = await setup()
    const added = await call('note.add', { id: 'n1', body: 'buy basil' })
    expect(added).toEqual({ status: 200, data: { id: 'n1', body: 'buy basil' } })
    expect(await lastLog()).toEqual({ principal: 'ana', op: 'note.add', status: 200, code: null })
    expect((await call('note.list', {})).data).toEqual([{ id: 'n1', body: 'buy basil' }])
    expect((await call('note.list', {}, 'ben')).data).toEqual([])
  })

  it('refuses a call with no token at the first check, and logs it', async () => {
    const { call, lastLog } = await setup()
    const res = await call('note.list', {}, null)
    expect(res).toMatchObject({ status: 401, data: { code: 'UNAUTHORIZED' } })
    expect(await lastLog()).toMatchObject({ principal: null, status: 401, code: 'UNAUTHORIZED' })
  })

  it('refuses a token with no principal behind it', async () => {
    const { call, lastLog } = await setup()
    const res = await call('note.list', {}, 'stranger')
    expect(res.data.code).toBe('NO_ACCOUNT')
    expect(await lastLog()).toMatchObject({ principal: 'stranger', status: 403 })
  })

  it('refuses a move outside the loadout, and logs it', async () => {
    const { db, call, lastLog } = await setup()
    await setLoadout(db, 'ana', 'toy', ['note.list'])
    const res = await call('note.add', { id: 'n1', body: 'basil' })
    expect(res).toMatchObject({ status: 403, data: { code: 'FORBIDDEN' } })
    expect(await lastLog()).toMatchObject({ op: 'note.add', status: 403, code: 'FORBIDDEN' })
  })

  it('refuses invalid input before any SQL runs, and logs it', async () => {
    const { call, lastLog } = await setup()
    const res = await call('note.add', { id: 'N 1', body: '' })
    expect(res.status).toBe(400)
    expect(res.data.code).toBe('VALIDATION')
    expect(res.data.details.length).toBeGreaterThan(0)
    expect(await lastLog()).toMatchObject({ status: 400, code: 'VALIDATION' })
  })

  it('refuses at a rule, names the rule, and writes nothing', async () => {
    const { call, lastLog } = await setup()
    const res = await call('note.add', { id: 'n1', body: 'BASIL' })
    expect(res).toMatchObject({ status: 400, data: { code: 'SHOUTING', rule: 'note.quiet' } })
    expect(await lastLog()).toMatchObject({ status: 400, code: 'SHOUTING' })
    expect((await call('note.list', {})).data).toEqual([])
  })

  it("answers not-found for another person's row, read or written", async () => {
    const { call } = await setup()
    await call('note.add', { id: 'n1', body: 'basil' })
    expect((await call('note.drop', { id: 'n1' }, 'ben')).data.code).toBe('NOT_FOUND')
    expect((await call('note.give', { id: 'n2', to: 'ben' })).data.code).toBe('NOT_FOUND')
    expect((await call('note.list', {}, 'ben')).data).toEqual([])
  })

  it('maps a constraint to the refusal the pack names for it', async () => {
    const { call } = await setup()
    await call('note.add', { id: 'n1', body: 'basil' })
    expect((await call('note.add', { id: 'n1', body: 'mint' }, 'ben')).data.code).toBe('NOTE_TAKEN')
  })

  it('refuses a pack with no live version, and a move that does not exist', async () => {
    const { app, call } = await setup()
    expect((await call('note.burn', {})).data.code).toBe('OP_NOT_FOUND')
    const res = await app.request('/ops/nopack/note.list', {
      method: 'POST',
      headers: { authorization: 'Bearer ana' },
    })
    expect(((await res.json()) as { code: string }).code).toBe('PACK_NOT_LIVE')
  })

  it('keeps text a person typed that looks like an escape, and logs the call', async () => {
    const { call, lastLog } = await setup()
    const body = 'see \\u0000 and \ud800'
    const res = await call('note.add', { id: 'n1', body })
    expect(res.status).toBe(200)
    expect(await lastLog()).toMatchObject({ status: 200, op: 'note.add' })
  })

  it('still answers and logs a refusal whose input the log cannot hold as it is', async () => {
    const { call, lastLog } = await setup()
    const res = await call('note.add', { id: 'n1', body: 'a\u0000b', extra: 'x'.repeat(20_000) })
    expect(res.data.code).toBe('VALIDATION')
    expect(await lastLog()).toMatchObject({ status: 400, code: 'VALIDATION' })
  })
})

describe('what a call reads, on every call', () => {
  it('sees a promotion and a rollback at the next call, in every core on the database', async () => {
    const { db, call } = await setup()
    const other = createCore(deps(db))
    const callOther = async (op: string) =>
      (
        await other.request(`/ops/toy/${op}`, {
          method: 'POST',
          headers: { authorization: 'Bearer ana' },
          body: '{}',
        })
      ).json() as Promise<{ code?: string }>
    const v2 = toyPack('1.1.0')
    v2.ops['note.count'] = {
      name: 'note.count',
      description: 'How many notes the caller has.',
      input: { type: 'object', additionalProperties: false, properties: {} },
      sql: 'select count(*)::int as result from toy.notes',
      returns: 'one',
    }
    expect((await call('note.count', {})).data.code).toBe('OP_NOT_FOUND')
    expect((await callOther('note.count')).code).toBe('OP_NOT_FOUND')
    await publish(db, v2, OWNER)
    await recordTestRun(db, {
      pack: 'toy',
      version: '1.1.0',
      hash: hashOf(v2),
      passed: true,
      results: [],
    })
    await setLoadout(db, 'ana', 'toy', Object.keys(v2.ops))
    await promote(db, { actor: OWNER, environment: 'local', pack: 'toy', version: '1.1.0' })
    expect(await call('note.count', {})).toEqual({ status: 200, data: 0 })
    expect(await callOther('note.count')).toBe(0)
    await promote(db, { actor: OWNER, environment: 'local', pack: 'toy', version: '1.0.0' })
    expect((await call('note.count', {})).data.code).toBe('OP_NOT_FOUND')
    expect((await callOther('note.count')).code).toBe('OP_NOT_FOUND')
  })

  it('reads the pointer, the account and the loadout in the first trip once it knows the version', async () => {
    const { db } = await setup()
    const firsts: string[] = []
    const watched: Db = {
      ...db,
      transaction: (fn, first, saved) => {
        firsts.push(first ?? '')
        return db.transaction(fn, first, saved)
      },
    }
    const app = createCore(deps(watched))
    const list = async (token: string) =>
      (
        await app.request('/ops/toy/note.list', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          body: '{}',
        })
      ).json() as Promise<unknown>
    await db.query(`insert into toy.notes (id, owner, body) values ('b1', 'ben', 'ben only')`)
    expect(await list('ana')).toEqual([])
    expect(await list('ben')).toEqual([{ id: 'b1', body: 'ben only' }])
    expect(await list('stranger')).toMatchObject({ code: 'NO_ACCOUNT' })
    expect(firsts.map((f) => f.includes('core_check'))).toEqual([false, true, true])
  })

  it('refuses a person at the next call once their loadout or their account is gone', async () => {
    const { db, call, lastLog } = await setup()
    expect((await call('note.list', {})).status).toBe(200)
    await setLoadout(db, 'ana', 'toy', [])
    expect((await call('note.list', {})).data.code).toBe('FORBIDDEN')
    await setLoadout(db, 'ana', 'toy', ['note.list'])
    expect((await call('note.list', {})).status).toBe(200)
    await db.query(`delete from packs.principals where id = 'ana'`)
    expect((await call('note.list', {})).data.code).toBe('NO_ACCOUNT')
    expect(await lastLog()).toMatchObject({ principal: 'ana', status: 403, code: 'NO_ACCOUNT' })
  })

  it('logs every call with its input as sent, refused or not', async () => {
    const { db, call } = await setup()
    const body = `it's \\ a "note"; drop table packs.op_calls; -- ünïcode 🌿`
    expect((await call('note.add', { id: 'n1', body })).status).toBe(200)
    expect((await call('note.add', { id: 'n2', body: 'LOUD' })).data.code).toBe('SHOUTING')
    expect((await call('note.add', { id: 'n1', body: 'again' }, 'ben')).data.code).toBe(
      'NOTE_TAKEN',
    )
    const rows = await db.query<{ input: unknown; status: number; code: string | null }>(
      `select input, status, code from packs.op_calls where op = 'note.add' order by id`,
    )
    expect(rows).toEqual([
      { input: { id: 'n1', body }, status: 200, code: null },
      { input: { id: 'n2', body: 'LOUD' }, status: 400, code: 'SHOUTING' },
      { input: { id: 'n1', body: 'again' }, status: 409, code: 'NOTE_TAKEN' },
    ])
  })
})

describe('an agent', () => {
  it("never exceeds its person's loadout, read on every call", async () => {
    const { db, call, pack } = await setup()
    await addPrincipal(db, 'ana-agent', 'ana')
    await setLoadout(db, 'ana-agent', 'toy', Object.keys(pack.ops))
    expect((await call('note.add', { id: 'n1', body: 'basil' }, 'ana-agent')).status).toBe(200)
    // The note is the person's: the agent acts for ana.
    expect((await call('note.list', {})).data).toEqual([{ id: 'n1', body: 'basil' }])
    await setLoadout(db, 'ana', 'toy', ['note.list'])
    const res = await call('note.add', { id: 'n2', body: 'mint' }, 'ana-agent')
    expect(res.data.code).toBe('FORBIDDEN')
  })

  it('cannot act for another agent', async () => {
    const { db } = await setup()
    await addPrincipal(db, 'ana-agent', 'ana')
    await expect(addPrincipal(db, 'agent-of-agent', 'ana-agent')).rejects.toThrow(/agent/)
  })
})
