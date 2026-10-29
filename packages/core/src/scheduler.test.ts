import { afterEach, describe, expect, it } from 'vitest'
import { type Db } from './db'
import { approve, simulatedConnector } from './effects'
import { call, type Connector } from './run'
import { startScheduler } from './scheduler'
import { deps, freshDb, goLive, person } from './testing'
import { toyPack } from './toy-pack'

const open: Db[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()))
})

/** `count` notes, each approved to go out now, and a connector that takes `ms` to send. */
async function setup(ms: number, count = 2) {
  const db = await freshDb()
  open.push(db)
  const pack = toyPack()
  await goLive(db, pack)
  await person(db, 'ana', pack)
  const sending = { now: 0, most: 0, done: 0 }
  const slow: Connector = {
    timeoutMs: 10_000,
    async send(input) {
      sending.most = Math.max(sending.most, ++sending.now)
      await new Promise((r) => setTimeout(r, ms))
      sending.now--
      sending.done++
      return simulatedConnector.send(input)
    },
  }
  const core = { ...deps(db), connectors: { simulated: slow } }
  for (const id of Array.from({ length: count }, (_, i) => `n${i + 1}`)) {
    await call(core, {
      authorization: 'Bearer ana',
      pack: 'toy',
      op: 'note.add',
      input: { id, body: id },
    })
    await approve(core, {
      authorization: 'Bearer ana',
      pack: 'toy',
      op: 'note.share',
      input: { id },
    })
    await db.query(
      `insert into packs.scheduled_calls (pack, op, key, input, principal, run_at)
       values ('toy', 'note.share', $1, $2, 'ana', '2026-10-06T03:59:00Z')`,
      [id, JSON.stringify({ id })],
    )
  }
  return { db, core, sending }
}

const statuses = (db: Db) =>
  db
    .query<{ status: string }>('select status from packs.scheduled_calls order by key')
    .then((rows) => rows.map((r) => r.status))

describe('the scheduler loop', () => {
  it('runs due calls side by side, so a long send does not hold the next', async () => {
    const { db, core, sending } = await setup(400)
    const stop = startScheduler(core, 20)
    await new Promise((r) => setTimeout(r, 150))
    await stop()
    expect(sending.most).toBe(2)
    expect(sending.done).toBe(2)
    expect(await statuses(db)).toEqual(['done', 'done'])
  })

  it('runs at most ten at once', async () => {
    const { core, sending } = await setup(500, 12)
    const stop = startScheduler(core, 20)
    // Two rounds of half a second: ten, then the two left.
    await new Promise((r) => setTimeout(r, 1500))
    await stop()
    expect(sending.most).toBe(10)
    expect(sending.done).toBe(12)
  })

  it('waits on stop for the sends under way, up to its limit', async () => {
    const { db, core, sending } = await setup(300)
    const stop = startScheduler(core, 20, 50)
    await new Promise((r) => setTimeout(r, 100))
    await stop()
    // Stopped before they ended: the limit ran out first.
    expect(sending.done).toBe(0)
    expect(await statuses(db)).toEqual(['running', 'running'])
  })
})
