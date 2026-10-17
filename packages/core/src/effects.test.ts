import { afterEach, describe, expect, it } from 'vitest'
import { createCore } from './app'
import { type Db } from './db'
import { fire, simulatedConnector } from './effects'
import { addPrincipal, promote, publish, recordTestRun, setLoadout } from './registry'
import { type Connector } from './run'
import { deps, freshDb, goLive, OWNER, person } from './testing'
import { toyPack } from './toy-pack'
import { hashOf } from './pack'

const open: Db[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()))
})

async function setup(connector: Connector = simulatedConnector) {
  const db = await freshDb()
  open.push(db)
  const pack = toyPack()
  await goLive(db, pack)
  await person(db, 'ana', pack)
  await addPrincipal(db, 'ana-agent', 'ana')
  await setLoadout(db, 'ana-agent', 'toy', Object.keys(pack.ops))
  const app = createCore({ ...deps(db), connectors: { simulated: connector } })
  const request = async (path: string, input: unknown, token: string) => {
    const res = await app.request(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, data: (await res.json()) as any }
  }
  const call = (op: string, input: unknown, token = 'ana') =>
    request(`/ops/toy/${op}`, input, token)
  const approve = (op: string, input: unknown, token = 'ana') =>
    request(`/approve/toy/${op}`, input, token)
  await call('note.add', { id: 'n1', body: 'basil' })
  return { db, app, call, approve, pack }
}

describe('an effect move', () => {
  it('waits for a person’s yes to exactly what it sends, and uses the yes once', async () => {
    const { call, approve } = await setup()
    const before = await call('note.share', { id: 'n1' })
    expect(before).toMatchObject({ status: 403, data: { code: 'NEEDS_APPROVAL' } })
    expect(before.data.details.payload).toEqual({ id: 'n1', body: 'basil' })
    const yes = await approve('note.share', { id: 'n1' })
    expect(yes.data.payload).toEqual({ id: 'n1', body: 'basil' })
    const sent = await call('note.share', { id: 'n1' })
    expect(sent).toMatchObject({ status: 200, data: { id: 'n1' } })
    expect(sent.data.shared).toMatch(/^simulated-/)
    expect((await call('note.share', { id: 'n1' })).data.code).toBe('NEEDS_APPROVAL')
  })

  it('treats an edit to what goes out as voiding the yes', async () => {
    const { db, call, approve } = await setup()
    await approve('note.share', { id: 'n1' })
    await db.query(`update toy.notes set body = 'basil and mint' where id = 'n1'`)
    expect((await call('note.share', { id: 'n1' })).data.code).toBe('NEEDS_APPROVAL')
  })

  it('lets an agent send what its person approved, but never approve', async () => {
    const { db, call, approve } = await setup()
    expect((await approve('note.share', { id: 'n1' }, 'ana-agent')).data.code).toBe('NOT_A_PERSON')
    await expect(
      db.query(
        `insert into packs.approvals (pack, op, payload_hash, approved_by)
         values ('toy', 'note.share', 'x', 'ana-agent')`,
      ),
    ).rejects.toThrow(/only a person/)
    expect((await call('note.share', { id: 'n1' }, 'ana-agent')).data.code).toBe('NEEDS_APPROVAL')
    await approve('note.share', { id: 'n1' })
    expect((await call('note.share', { id: 'n1' }, 'ana-agent')).status).toBe(200)
  })

  it('uses up the yes when the send fails, so a retry needs a person again', async () => {
    let fail = true
    const flaky: Connector = {
      async send(input) {
        if (fail) throw new Error('the platform did not answer')
        return simulatedConnector.send(input)
      },
    }
    const { call, approve } = await setup(flaky)
    await approve('note.share', { id: 'n1' })
    expect((await call('note.share', { id: 'n1' })).data.code).toBe('SEND_FAILED')
    fail = false
    expect((await call('note.share', { id: 'n1' })).data.code).toBe('NEEDS_APPROVAL')
  })

  it('is an effect because it names a connector, whatever else the version says', async () => {
    const { approve } = await setup()
    expect((await approve('note.add', { id: 'n2', body: 'mint' })).data.code).toBe('NOT_AN_EFFECT')
  })
})

describe('a person’s yes', () => {
  it('is used by one of three sends at once, and the connector sends once', async () => {
    let sends = 0
    const counting: Connector = {
      async send(input) {
        sends++
        return simulatedConnector.send(input)
      },
    }
    const { call, approve } = await setup(counting)
    await approve('note.share', { id: 'n1' })
    const codes = (
      await Promise.all([1, 2, 3].map(() => call('note.share', { id: 'n1' }, 'ana-agent')))
    ).map((r) => r.data.code ?? null)
    expect(codes.sort()).toEqual(['NEEDS_APPROVAL', 'NEEDS_APPROVAL', null].sort())
    expect(sends).toBe(1)
  })

  it('lapses when its person loses the move', async () => {
    const { db, approve, pack } = await setup()
    await approve('note.share', { id: 'n1' })
    await setLoadout(db, 'ana', 'toy', ['note.list'])
    // Past the loadout check, straight to the send: the yes no longer counts.
    const sent = fire(
      { ...deps(db), connectors: { simulated: simulatedConnector } },
      pack,
      pack.ops['note.share']!,
      { principal: 'ana', person: 'ana', agent: null },
      { id: 'n1' },
      async () => {},
    )
    await expect(sent).rejects.toMatchObject({ code: 'NEEDS_APPROVAL' })
  })

  it('is refused while a send of exactly the same thing is on its way', async () => {
    let release: () => void = () => undefined
    const slow: Connector = {
      send: (input) =>
        new Promise((resolve) => {
          release = () => void simulatedConnector.send(input).then(resolve)
        }),
    }
    const { call, approve } = await setup(slow)
    await approve('note.share', { id: 'n1' })
    const first = call('note.share', { id: 'n1' })
    await new Promise((r) => setTimeout(r, 300))
    expect((await approve('note.share', { id: 'n1' })).data.code).toBe('SENDING')
    release()
    expect((await first).status).toBe(200)
  })

  it('keeps the connector’s answer the moment it comes back', async () => {
    const { db, call, approve } = await setup()
    await approve('note.share', { id: 'n1' })
    await call('note.share', { id: 'n1' })
    const [row] = await db.query<{ outcome: { externalId: string } }>(
      'select outcome from packs.approvals',
    )
    expect(row!.outcome.externalId).toMatch(/^simulated-/)
  })
})

describe('an agent and versions', () => {
  it('may draft a version but never promote one', async () => {
    const { db } = await setup()
    const v2 = toyPack('1.1.0')
    await publish(db, v2, 'ana-agent')
    await recordTestRun(db, {
      pack: 'toy',
      version: '1.1.0',
      hash: hashOf(v2),
      passed: true,
      results: [],
    })
    await expect(
      promote(db, { actor: 'ana-agent', environment: 'local', pack: 'toy', version: '1.1.0' }),
    ).rejects.toThrow(/person/)
    await promote(db, { actor: OWNER, environment: 'local', pack: 'toy', version: '1.1.0' })
  })
})

describe('the MCP endpoint', () => {
  const rpc = async (app: ReturnType<typeof createCore>, body: unknown, token = 'ana-agent') => {
    const res = await app.request('/mcp/toy', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = res.status === 202 ? null : await res.json()
    return { status: res.status, data }
  }

  it('lists the moves in the agent’s loadout and its person’s, read on every request', async () => {
    const { db, app } = await setup()
    const init = await rpc(app, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(init.data.result.capabilities.tools).toBeDefined()
    const list = async () =>
      (await rpc(app, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).data.result.tools.map(
        (t: { name: string }) => t.name,
      )
    expect(await list()).toEqual([
      'note__add',
      'note__drop',
      'note__give',
      'note__list',
      'note__share',
    ])
    await setLoadout(db, 'ana', 'toy', ['note.list'])
    expect(await list()).toEqual(['note__list'])
  })

  it('calls a move through the same checks as a screen, and answers a refusal as the tool’s', async () => {
    const { app } = await setup()
    const listed = await rpc(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'note__list', arguments: {} },
    })
    expect(listed.data.result.isError).toBe(false)
    expect(JSON.parse(listed.data.result.content[0].text)).toEqual([{ id: 'n1', body: 'basil' }])
    const refused = await rpc(app, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'note__share', arguments: { id: 'n1' } },
    })
    expect(refused.data.result.isError).toBe(true)
    expect(JSON.parse(refused.data.result.content[0].text).code).toBe('NEEDS_APPROVAL')
  })

  it('answers a notification with nothing, a missing token with 401, and a refusal as its own error', async () => {
    const { app } = await setup()
    expect((await rpc(app, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(
      202,
    )
    const none = await app.request('/mcp/toy', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'note__list' },
      }),
    })
    expect(none.status).toBe(401)
    // A stranger's batch: the refused request answers with its error, the next still runs.
    const batch = await rpc(
      app,
      [
        { jsonrpc: '2.0', id: 5, method: 'tools/list' },
        { jsonrpc: '2.0', id: 6, method: 'ping' },
      ],
      'nobody',
    )
    expect(batch.data[0].error.data.code).toBe('NO_ACCOUNT')
    expect(batch.data[1].result).toEqual({})
    expect((await rpc(app, [])).status).toBe(400)
  })
})
