import { afterEach, describe, expect, it } from 'vitest'
import { createCore } from './app'
import { type Db } from './db'
import { addPrincipal, setLoadout } from './registry'
import { deps, freshDb, goLive, person } from './testing'
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
