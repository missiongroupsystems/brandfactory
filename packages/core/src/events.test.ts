import { afterEach, describe, expect, it } from 'vitest'
import { createCore } from './app'
import { type Db } from './db'
import { deps, freshDb, goLive, person } from './testing'
import { toyPack } from './toy-pack'

const open: Db[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()))
})

describe('the events stream', () => {
  it('tells an open screen within a second that something changed, and nothing more', async () => {
    const db = await freshDb()
    open.push(db)
    const pack = toyPack()
    await goLive(db, pack)
    await person(db, 'ana', pack)
    const app = createCore(deps(db))
    const res = await app.request('/events/toy?token=ana')
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    const text = new TextDecoder()
    const started = Date.now()
    await app.request('/ops/toy/note.add', {
      method: 'POST',
      headers: { authorization: 'Bearer ana' },
      body: JSON.stringify({ id: 'n1', body: 'basil' }),
    })
    let seen = ''
    while (!seen.includes('event: changed')) {
      const { value, done } = await reader.read()
      if (done) break
      seen += text.decode(value)
    }
    expect(Date.now() - started).toBeLessThan(1000)
    const data = seen
      .split('event: changed')[1]!
      .split('\n')
      .find((l) => l.startsWith('data:'))!
    expect(Object.keys(JSON.parse(data.slice(5)) as object).sort()).toEqual(['at', 'pack'])
    await reader.cancel()
  })

  it('refuses a caller with no token or no account, and a name that is not a pack', async () => {
    const db = await freshDb()
    open.push(db)
    await goLive(db, toyPack())
    await person(db, 'ana', toyPack())
    const app = createCore(deps(db))
    expect((await app.request('/events/toy')).status).toBe(401)
    expect((await app.request('/events/toy?token=nobody')).status).toBe(403)
    // The emitter's own events are not packs.
    expect((await app.request('/events/newListener?token=ana')).status).toBe(404)
  })
})
