import { afterEach, describe, expect, it } from 'vitest'
import { AGENT_TOKEN_MS, agentTokens, withAgentTokens } from './agents'
import { createCore } from './app'
import { devAuth } from './auth'
import { type Db } from './db'
import { simulatedConnector } from './effects'
import { addPrincipal, setLoadout } from './registry'
import { deps, freshDb, goLive, person } from './testing'
import { toyPack } from './toy-pack'

const open: Db[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()))
})

const SECRET = 'a-test-agent-secret-of-32-chars-at-least'

async function setup() {
  const db = await freshDb()
  open.push(db)
  const pack = toyPack()
  await goLive(db, pack)
  await person(db, 'ana', pack)
  let now = new Date('2026-10-06T04:00:00Z')
  const agents = agentTokens(SECRET)
  const base = deps(db)
  const app = createCore({
    ...base,
    now: () => now,
    auth: withAgentTokens(devAuth(), agents, () => now),
    agents,
    connectors: { simulated: simulatedConnector },
  })
  const ask = async (path: string, input: unknown, token: string) => {
    const res = await app.request(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, data: (await res.json()) as any }
  }
  const session = async (token = 'ana', name = 'bubbles') => ask('/agents/session', { name }, token)
  const tools = async (token: string) =>
    (
      await ask('/mcp/toy', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, token)
    ).data.result.tools.map((t: { name: string }) => t.name)
  return {
    db,
    app,
    pack,
    ask,
    session,
    tools,
    later: (ms: number) => (now = new Date(now.getTime() + ms)),
  }
}

describe('an agent session', () => {
  it('gives a person’s agent its own token, and logs its calls as the agent’s, for the person', async () => {
    const { db, ask, session } = await setup()
    const s = await session()
    expect(s.status).toBe(200)
    expect(s.data.principal).toBe('ana/bubbles')
    expect(s.data.token).toMatch(/^agent\./)
    const added = await ask('/ops/toy/note.add', { id: 'n1', body: 'basil' }, s.data.token)
    expect(added.status).toBe(200)
    const [row] = await db.query<{ principal: string; agent_of: string }>(
      `select principal, agent_of from packs.op_calls where op = 'note.add'`,
    )
    expect(row).toEqual({ principal: 'ana/bubbles', agent_of: 'ana' })
  })

  it('lets the agent do only what its person may do, and follows the person’s rights at once', async () => {
    const { db, pack, session, tools } = await setup()
    await setLoadout(db, 'ana', 'toy', ['note.list', 'note.add'])
    const s = await session()
    expect(await tools(s.data.token)).toEqual(['note__add', 'note__list'])
    // The core checks both loadouts on every call: a move taken from the person is gone from
    // the agent before its next session.
    await setLoadout(db, 'ana', 'toy', ['note.list'])
    expect(await tools(s.data.token)).toEqual(['note__list'])
    // A move the agent never had reaches it only with its next session.
    await setLoadout(db, 'ana', 'toy', Object.keys(pack.ops))
    expect(await tools(s.data.token)).toEqual(['note__add', 'note__list'])
    expect(await tools((await session()).data.token)).toHaveLength(Object.keys(pack.ops).length)
    // A pack the person lost entirely leaves the agent with its next session.
    await db.query(`delete from packs.loadouts where principal = 'ana'`)
    await session()
    const left = await db.query(`select pack from packs.loadouts where principal = 'ana/bubbles'`)
    expect(left).toEqual([])
  })

  it('sends nothing without the person’s yes, and the agent can never give that yes', async () => {
    const { ask, session } = await setup()
    const agent = (await session()).data.token
    await ask('/ops/toy/note.add', { id: 'n1', body: 'basil' }, agent)
    const refused = await ask('/ops/toy/note.share', { id: 'n1' }, agent)
    expect(refused).toMatchObject({ status: 403, data: { code: 'NEEDS_APPROVAL' } })
    expect((await ask('/approve/toy/note.share', { id: 'n1' }, agent)).data.code).toBe(
      'NOT_A_PERSON',
    )
    expect((await ask('/approve/toy/note.share', { id: 'n1' }, 'ana')).status).toBe(200)
    expect((await ask('/ops/toy/note.share', { id: 'n1' }, agent)).status).toBe(200)
  })

  it('is started only by a person with an account, for a plainly named agent', async () => {
    const { db, session } = await setup()
    await addPrincipal(db, 'ana-helper', 'ana')
    expect((await session('ana-helper')).data.code).toBe('NOT_A_PERSON')
    expect((await session('bo')).data.code).toBe('NO_ACCOUNT')
    expect((await session('ana', 'Bubbles!')).status).toBe(400)
    // An agent's own token cannot start another agent.
    const agent = (await session()).data.token
    expect((await session(agent)).data.code).toBe('NOT_A_PERSON')
  })

  it('refuses an expired, altered or foreign token', async () => {
    const { ask, session, later } = await setup()
    const token: string = (await session()).data.token
    const list = (t: string) => ask('/ops/toy/note.list', {}, t)
    expect((await list(token)).status).toBe(200)
    const [payload, mac] = token.slice('agent.'.length).split('.')
    const forged = Buffer.from(
      JSON.stringify({ sub: 'ana', exp: Date.parse('2027-01-01') }),
    ).toString('base64url')
    expect((await list(`agent.${forged}.${mac}`)).status).toBe(401)
    expect((await list(`agent.${payload}.${mac}x`)).status).toBe(401)
    const foreign = agentTokens('another-secret-of-32-characters-or-more').sign(
      'ana/bubbles',
      new Date('2026-10-06T04:00:00Z'),
    )
    expect((await list(foreign.token)).status).toBe(401)
    later(AGENT_TOKEN_MS)
    expect((await list(token)).status).toBe(401)
  })

  it('is refused by a core that has no agent secret', async () => {
    const db = await freshDb()
    open.push(db)
    await goLive(db, toyPack())
    await person(db, 'ana', toyPack())
    const res = await createCore(deps(db)).request('/agents/session', {
      method: 'POST',
      headers: { authorization: 'Bearer ana' },
      body: JSON.stringify({ name: 'bubbles' }),
    })
    expect(res.status).toBe(503)
  })
})
