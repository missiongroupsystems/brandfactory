import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import type { AgentMessage } from '@brandfactory/shared'
import { createNativeWsRealtimeBus } from './native-ws'

interface Harness {
  url: string
  close: () => Promise<void>
  bus: ReturnType<typeof createNativeWsRealtimeBus>
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop()
    if (fn) await fn().catch(() => undefined)
  }
})

async function startBus(
  opts: {
    authenticate?: (req: unknown) => string | null
    heartbeatIntervalMs?: number
  } = {},
): Promise<Harness> {
  const bus = createNativeWsRealtimeBus()
  const http = createServer()
  const wss = new WebSocketServer({ server: http })
  bus.bindToNodeWebSocketServer(wss, {
    authenticate: opts.authenticate ?? (() => 'user-1'),
    ...(opts.heartbeatIntervalMs !== undefined
      ? { heartbeatIntervalMs: opts.heartbeatIntervalMs }
      : {}),
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const addr = http.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  const url = `ws://127.0.0.1:${addr.port}`
  const close = async () => {
    await new Promise<void>((r) => wss.close(() => r()))
    await new Promise<void>((r) => http.close(() => r()))
  }
  cleanups.push(close)
  return { url, close, bus }
}

function makeClient(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url)
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.once('message', (raw) => {
      try {
        resolve(JSON.parse(raw.toString()))
      } catch (err) {
        reject(err)
      }
    })
  })
}

const helloEvent: AgentMessage = { kind: 'message', id: 'm1', role: 'assistant', content: 'hi' }

describe('native-ws realtime bus', () => {
  it('in-process publish/subscribe fans out to subscribers', async () => {
    const { bus, close } = await startBus()
    const seen: string[] = []
    const off = bus.subscribe('chan', (e) => {
      if (e.kind === 'message') seen.push(e.content)
    })
    await bus.publish('chan', helloEvent)
    expect(seen).toEqual(['hi'])
    off()
    await bus.publish('chan', helloEvent)
    expect(seen).toEqual(['hi'])
    await close()
  })

  it('fans events to two WS clients on the same channel', async () => {
    const { url, bus } = await startBus()
    const a = await makeClient(url)
    const b = await makeClient(url)
    a.send(JSON.stringify({ type: 'subscribe', channel: 'shared' }))
    b.send(JSON.stringify({ type: 'subscribe', channel: 'shared' }))
    // wait a tick for subscribes to register
    await new Promise((r) => setTimeout(r, 25))

    const aWait = nextMessage(a)
    const bWait = nextMessage(b)
    await bus.publish('shared', helloEvent)

    const [aMsg, bMsg] = await Promise.all([aWait, bWait])
    for (const m of [aMsg, bMsg]) {
      const obj = m as { type: string; channel: string; payload: { content: string } }
      expect(obj.type).toBe('event')
      expect(obj.channel).toBe('shared')
      expect(obj.payload.content).toBe('hi')
    }
    a.close()
    b.close()
  })

  it('unsubscribe stops further delivery', async () => {
    const { url, bus } = await startBus()
    const c = await makeClient(url)
    c.send(JSON.stringify({ type: 'subscribe', channel: 'x' }))
    await new Promise((r) => setTimeout(r, 25))

    const first = nextMessage(c)
    await bus.publish('x', helloEvent)
    await first

    c.send(JSON.stringify({ type: 'unsubscribe', channel: 'x' }))
    await new Promise((r) => setTimeout(r, 25))

    let received = false
    c.once('message', () => {
      received = true
    })
    await bus.publish('x', helloEvent)
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toBe(false)
    c.close()
  })

  it('dedups same-tick subscribes to the same channel (no double-fan-out)', async () => {
    // Authorize is async, so the second subscribe arrives before the first
    // resolves. Without the placeholder-stake guard, both would register a
    // handler and the client would receive every published event twice.
    const bus = createNativeWsRealtimeBus()
    const http = createServer()
    const wss = new WebSocketServer({ server: http })
    let authorizeCalls = 0
    bus.bindToNodeWebSocketServer(wss, {
      authenticate: () => 'user-1',
      authorize: async () => {
        authorizeCalls += 1
        await new Promise((r) => setTimeout(r, 25))
        return true
      },
    })
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
    const addr = http.address()
    if (addr === null || typeof addr === 'string') throw new Error('no address')
    const url = `ws://127.0.0.1:${addr.port}`
    cleanups.push(async () => {
      await new Promise<void>((r) => wss.close(() => r()))
      await new Promise<void>((r) => http.close(() => r()))
    })

    const c = await makeClient(url)
    c.send(JSON.stringify({ type: 'subscribe', channel: 'dup' }))
    c.send(JSON.stringify({ type: 'subscribe', channel: 'dup' }))
    // Wait for both authorize promises to resolve.
    await new Promise((r) => setTimeout(r, 75))

    const received: unknown[] = []
    c.on('message', (raw) => received.push(JSON.parse(raw.toString())))
    await bus.publish('dup', helloEvent)
    await new Promise((r) => setTimeout(r, 25))

    // Second subscribe is staked-out by the placeholder, so authorize runs
    // exactly once and the handler is registered exactly once.
    expect(authorizeCalls).toBe(1)
    expect(received).toHaveLength(1)
    c.close()
  })

  it('terminates zombie sockets that stop responding to pings', async () => {
    // Simulate a client that opens, then stops responding (tab suspended,
    // wifi drop). `ws` auto-pongs on every received ping; overriding the
    // client's `pong` method makes the reply a no-op, so the server sees
    // no response and — after missing two sweep ticks — `terminate()`s the
    // zombie. Without the heartbeat, that socket would live indefinitely
    // and subscriptions would never be released.
    const { url } = await startBus({ heartbeatIntervalMs: 40 })
    const c = await makeClient(url)
    ;(c as unknown as { pong: (...args: unknown[]) => void }).pong = () => {}

    const closed = await new Promise<boolean>((resolve) => {
      c.once('close', () => resolve(true))
      // Safety timeout so a regression doesn't hang the test forever.
      setTimeout(() => resolve(false), 500)
    })

    expect(closed).toBe(true)
    expect(c.readyState).toBe(WebSocket.CLOSED)
  })

  it('rejects connections that fail authentication', async () => {
    const { url } = await startBus({ authenticate: () => null })
    const ws = new WebSocket(url)
    const closeCode = await new Promise<number>((resolve, reject) => {
      ws.once('close', (code) => resolve(code))
      ws.once('error', reject)
    })
    expect(closeCode).toBe(4401)
  })
})

// ---------------------------------------------------------------------------
// disconnectUser — forcing RE-AUTHORIZATION, not signing anybody out
// ---------------------------------------------------------------------------
//
// `authorize` runs once per channel at subscribe time and never again, so a person
// whose access changed mid-session keeps receiving events on channels they have since
// lost. Denying their HTTP reads does nothing about an already-open subscription; the
// only way to re-check is to make the client reconnect.
//
// Used by Passport offboarding on `membership.removed`
// (`packages/server/src/passport/offboard.ts`).

describe('disconnectUser', () => {
  it('closes that user’s sockets and stops the fan-out reaching them', async () => {
    const { bus, url, close } = await startBus({ authenticate: () => 'user-1' })
    const client = await makeClient(url)
    client.send(JSON.stringify({ type: 'subscribe', channel: 'chan' }))
    await new Promise((r) => setTimeout(r, 30))

    const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)))
    expect(bus.disconnectUser('user-1')).toBe(1)

    // `4403`, not `4401`: a client reading this as an auth failure would sign the
    // person out, which is exactly what must not happen — they may still be entitled
    // to most of what they had.
    expect(await closed).toBe(4403)

    // The socket's `close` handler cleared its subscriptions, so a later publish
    // reaches nobody rather than a dead send buffer.
    await bus.publish('chan', helloEvent)
    await close()
  })

  it('leaves other users connected', async () => {
    let next = 0
    const users = ['user-1', 'user-2']
    const { bus, url, close } = await startBus({ authenticate: () => users[next++] ?? null })

    const first = await makeClient(url)
    const second = await makeClient(url)
    await new Promise((r) => setTimeout(r, 20))

    // Removal from ONE organisation must not end anybody else's session, and must not
    // end this person's other connections either.
    expect(bus.disconnectUser('user-1')).toBe(1)
    await new Promise((r) => setTimeout(r, 20))

    expect(first.readyState).not.toBe(WebSocket.OPEN)
    expect(second.readyState).toBe(WebSocket.OPEN)

    // Close the survivor before tearing the server down: `wss.close()` waits for its
    // clients, so a deliberately-still-open socket hangs the teardown rather than the
    // assertion — which reads as a mysteriously slow test.
    second.close()
    await new Promise((r) => setTimeout(r, 20))
    await close()
  })

  it('closes every socket a user holds, not just the newest', async () => {
    const { bus, url, close } = await startBus({ authenticate: () => 'user-1' })
    await makeClient(url)
    await makeClient(url)
    await new Promise((r) => setTimeout(r, 20))

    // Two tabs is the ordinary case, and leaving one open would be the whole bug.
    expect(bus.disconnectUser('user-1')).toBe(2)
    await close()
  })

  it('is a no-op for a user with no live socket', async () => {
    const { bus, close } = await startBus()
    // The common case: most people are not connected when they are removed.
    expect(bus.disconnectUser('nobody')).toBe(0)
    await close()
  })

  it('forgets a user once their last socket closes', async () => {
    const { bus, url, close } = await startBus({ authenticate: () => 'user-1' })
    const client = await makeClient(url)
    await new Promise((r) => setTimeout(r, 20))

    client.close()
    await new Promise((r) => setTimeout(r, 40))

    // Otherwise a long-lived process accumulates one empty Set per user who has ever
    // connected.
    expect(bus.disconnectUser('user-1')).toBe(0)
    await close()
  })
})
