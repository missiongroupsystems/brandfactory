import { describe, expect, it, vi } from 'vitest'
import { createPgBackplaneRealtimeBus } from './pg-backplane'
import type { RealtimeEvent } from './port'

// A fake Postgres shared by every client in one test: the rows, the LISTEN
// registrations and `pg_notify` all land here, so two bus instances built over
// one `FakePg` behave like two machines against one database.
//
// This is the only way to test the thing that actually breaks. A single bus is
// exactly as correct with the backplane as without it; the bug being fixed only
// exists between two processes, so a fixture that cannot represent two of them
// asserts nothing.
interface FakePg {
  rows: Map<string, { channel: string; payload: RealtimeEvent }>
  listeners: ((payload: string) => void)[]
  /** Set to make the next query throw, for the degraded paths. */
  failNext: boolean
  client: () => unknown
}

function createFakePg(): FakePg {
  const rows = new Map<string, { channel: string; payload: RealtimeEvent }>()
  const listeners: ((payload: string) => void)[] = []
  let seq = 0
  const state = { failNext: false }

  // A closure rather than a class: every handler below needs the shared state,
  // and reaching it through `this` would mean aliasing `this` in the client
  // factory — which the lint rule forbids, correctly.
  const client = () => {
    let onNotification: ((msg: { payload?: string }) => void) | null = null
    return {
      on(event: string, handler: (arg: never) => void) {
        if (event === 'notification') {
          onNotification = handler as (msg: { payload?: string }) => void
        }
      },
      connect: () => Promise.resolve(),
      end: () => Promise.resolve(),
      query(sql: string, params?: unknown[]) {
        if (state.failNext) {
          state.failNext = false
          return Promise.reject(new Error('connection terminated'))
        }
        if (sql.startsWith('listen')) {
          listeners.push((payload: string) => onNotification?.({ payload }))
          return Promise.resolve({ rows: [] })
        }
        if (sql.startsWith('insert into realtime_events')) {
          seq += 1
          const id = `row-${seq}`
          rows.set(id, {
            channel: params![0] as string,
            payload: JSON.parse(params![1] as string) as RealtimeEvent,
          })
          return Promise.resolve({ rows: [{ id }] })
        }
        if (sql.startsWith('select pg_notify')) {
          // Delivered to every listener, including the publisher's own — which
          // is exactly the condition echo suppression has to survive.
          for (const l of listeners) l(params![1] as string)
          return Promise.resolve({ rows: [] })
        }
        if (sql.startsWith('select channel, payload')) {
          const row = rows.get(params![0] as string)
          return Promise.resolve({ rows: row ? [row] : [] })
        }
        return Promise.resolve({ rows: [] })
      },
    }
  }

  return {
    rows,
    listeners,
    get failNext() {
      return state.failNext
    },
    set failNext(v: boolean) {
      state.failNext = v
    },
    client,
  }
}

function message(content: string): RealtimeEvent {
  return { kind: 'message', id: 'm-1', role: 'assistant', content }
}

async function twoInstances(pg: FakePg) {
  const onError = vi.fn()
  const mk = (instanceId: string) =>
    createPgBackplaneRealtimeBus({
      connectionString: 'postgres://x',
      instanceId,
      createClient: () => pg.client() as never,
      onError,
    })
  const a = mk('instance-a')
  const b = mk('instance-b')
  await a.start()
  await b.start()
  return { a, b, onError }
}

// `pg_notify` is delivered synchronously by the fake, but the handler reads the
// row with an await, so the fan-out lands a microtask later.
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('createPgBackplaneRealtimeBus', () => {
  it('delivers a publish on one instance to a subscriber on the other', async () => {
    const pg = createFakePg()
    const { a, b } = await twoInstances(pg)
    const onB = vi.fn()
    b.subscribe('project:p1', onB)

    await a.publish('project:p1', message('Five name directions.'))
    await settle()

    expect(onB).toHaveBeenCalledTimes(1)
    expect(onB.mock.calls[0]?.[0]).toMatchObject({ content: 'Five name directions.' })
    await a.stop()
    await b.stop()
  })

  // Without echo suppression the publishing instance fans out twice — once
  // locally, once when its own broadcast returns — and every message in the
  // chat appears duplicated.
  it('does not deliver an instance its own broadcast a second time', async () => {
    const pg = createFakePg()
    const { a, b } = await twoInstances(pg)
    const onA = vi.fn()
    a.subscribe('project:p1', onA)

    await a.publish('project:p1', message('once'))
    await settle()

    expect(onA).toHaveBeenCalledTimes(1)
    await a.stop()
    await b.stop()
  })

  it('leaves a subscriber on another channel alone', async () => {
    const pg = createFakePg()
    const { a, b } = await twoInstances(pg)
    const onB = vi.fn()
    b.subscribe('project:other', onB)

    await a.publish('project:p1', message('hello'))
    await settle()

    expect(onB).not.toHaveBeenCalled()
    await a.stop()
    await b.stop()
  })

  // The payload is why there is a row at all: a `NOTIFY` caps at 8000 bytes and
  // a canvas block with a ProseMirror body clears that.
  it('carries a payload far larger than a notification could hold', async () => {
    const pg = createFakePg()
    const { a, b } = await twoInstances(pg)
    const onB = vi.fn()
    b.subscribe('project:p1', onB)

    const big = 'x'.repeat(20_000)
    await a.publish('project:p1', message(big))
    await settle()

    expect((onB.mock.calls[0]?.[0] as { content: string }).content).toHaveLength(20_000)
    await a.stop()
    await b.stop()
  })

  // A backplane that is down must degrade to single-instance behaviour, not to
  // silence: the reader attached to the publishing machine still sees the reply.
  it('still fans out locally when the broadcast fails', async () => {
    const pg = createFakePg()
    const { a, b, onError } = await twoInstances(pg)
    const onA = vi.fn()
    a.subscribe('project:p1', onA)

    pg.failNext = true
    await a.publish('project:p1', message('degraded'))
    await settle()

    expect(onA).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalled()
    await a.stop()
    await b.stop()
  })

  it('ignores a notification that is not an envelope', async () => {
    const pg = createFakePg()
    const { a, b, onError } = await twoInstances(pg)
    const onB = vi.fn()
    b.subscribe('project:p1', onB)

    for (const l of pg.listeners) l('not json')
    for (const l of pg.listeners) l(JSON.stringify({ nope: true }))
    await settle()

    expect(onB).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    await a.stop()
    await b.stop()
  })

  it('ignores an envelope whose row has been swept', async () => {
    const pg = createFakePg()
    const { a, b, onError } = await twoInstances(pg)
    const onB = vi.fn()
    b.subscribe('project:p1', onB)

    for (const l of pg.listeners) l(JSON.stringify({ id: 'row-gone', from: 'instance-a' }))
    await settle()

    expect(onB).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    await a.stop()
    await b.stop()
  })

  it('still exposes the socket binder, because the socket is still local', async () => {
    const pg = createFakePg()
    const { a, b } = await twoInstances(pg)
    expect(typeof a.bindToNodeWebSocketServer).toBe('function')
    await a.stop()
    await b.stop()
  })
})
