import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModuleImport from './client'

// The client resolves an auth token before constructing each socket, so tests
// drive the token source rather than the auth store. `vi.hoisted` because the
// mock factory is hoisted above this file's own initialisation.
const auth = vi.hoisted(() => ({ token: 'tok-1' as string | null, calls: 0 }))

vi.mock('@/auth/session', () => ({
  getFreshAuthToken: () => {
    auth.calls++
    return Promise.resolve(auth.token)
  },
}))

// Minimal fake WebSocket capturing handlers and sent frames so we can drive
// the `RealtimeClient` state machine deterministically. The real DOM
// WebSocket is replaced via `vi.stubGlobal` before each test.
class FakeWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSING = 2
  static CLOSED = 3

  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  url: string
  private listeners: Record<string, Array<(ev: unknown) => void>> = {}

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(kind: string, fn: (ev: unknown) => void) {
    ;(this.listeners[kind] ??= []).push(fn)
  }

  removeEventListener(kind: string, fn: (ev: unknown) => void) {
    this.listeners[kind] = (this.listeners[kind] ?? []).filter((f) => f !== fn)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }

  // Drivers — call from tests to push state transitions into the client.
  fireOpen() {
    this.readyState = FakeWebSocket.OPEN
    for (const l of this.listeners.open ?? []) l({})
  }

  fireMessage(data: string) {
    for (const l of this.listeners.message ?? []) l({ data })
  }

  fireClose() {
    this.readyState = FakeWebSocket.CLOSED
    for (const l of this.listeners.close ?? []) l({})
  }
}

// A connect attempt now spans at least one microtask (the token await), so the
// socket is not there the instant `subscribe()` returns. Drain the microtask
// queue instead of guessing a tick count. Fake timers don't stall microtasks,
// so this stays deterministic.
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

// Drains, then returns the nth socket (1-indexed), failing loudly rather than
// handing back `undefined` for a later line to trip over.
async function awaitSocket(n: number): Promise<FakeWebSocket> {
  await flush()
  const ws = FakeWebSocket.instances[n - 1]
  if (!ws) throw new Error(`socket #${n} was never constructed`)
  return ws
}

describe('RealtimeClient', () => {
  let realtimeClient: typeof ClientModuleImport.realtimeClient

  beforeEach(async () => {
    FakeWebSocket.instances = []
    auth.token = 'tok-1'
    auth.calls = 0
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.useFakeTimers()
    // Fresh module — the singleton's internal state resets between tests.
    vi.resetModules()
    ;({ realtimeClient } = await import('./client'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens a socket on first subscribe and sends subscribe after onOpen', async () => {
    const handler = vi.fn()
    realtimeClient.subscribe('project:p1', handler)

    const ws = await awaitSocket(1)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(ws.sent).toEqual([])

    ws.fireOpen()
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'subscribe', channel: 'project:p1' })
  })

  it('dispatches validated event frames to the matching channel handler', async () => {
    const handler = vi.fn()
    realtimeClient.subscribe('project:p1', handler)
    const ws = await awaitSocket(1)
    ws.fireOpen()

    const payload = { kind: 'message', id: 'm1', role: 'assistant', content: 'hi' }
    ws.fireMessage(JSON.stringify({ type: 'event', channel: 'project:p1', payload }))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(payload)
  })

  it('drops malformed frames silently', async () => {
    const handler = vi.fn()
    realtimeClient.subscribe('project:p1', handler)
    const ws = await awaitSocket(1)
    ws.fireOpen()

    ws.fireMessage('not-json')
    ws.fireMessage(
      JSON.stringify({ type: 'event', channel: 'project:p1', payload: { bogus: true } }),
    )

    expect(handler).not.toHaveBeenCalled()
  })

  it('routes frames to the right channel only', async () => {
    const a = vi.fn()
    const b = vi.fn()
    realtimeClient.subscribe('project:a', a)
    realtimeClient.subscribe('project:b', b)
    const ws = await awaitSocket(1)
    ws.fireOpen()

    const payload = { kind: 'message', id: 'm', role: 'assistant', content: 'x' }
    ws.fireMessage(JSON.stringify({ type: 'event', channel: 'project:a', payload }))

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
  })

  it('ref-counts subscribers on the same channel — second subscribe does not open a new socket', async () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    realtimeClient.subscribe('project:p1', h1)
    const ws = await awaitSocket(1)
    ws.fireOpen()

    realtimeClient.subscribe('project:p1', h2)
    // Drain first: a second connect would be async, and asserting before the
    // microtask queue empties would pass even if one had been started.
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(1)

    const payload = { kind: 'message', id: 'm', role: 'assistant', content: 'x' }
    ws.fireMessage(JSON.stringify({ type: 'event', channel: 'project:p1', payload }))
    expect(h1).toHaveBeenCalled()
    expect(h2).toHaveBeenCalled()
  })

  it('closes the socket when the last subscriber on the last channel unmounts', async () => {
    const h = vi.fn()
    const unsub = realtimeClient.subscribe('project:p1', h)
    const ws = await awaitSocket(1)
    ws.fireOpen()

    unsub()

    // unsubscribe frame emitted before socket closes
    const last = JSON.parse(ws.sent.at(-1) as string)
    expect(last).toEqual({ type: 'unsubscribe', channel: 'project:p1' })
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED)
  })

  it('keeps the socket open while other channels still have subscribers', async () => {
    const ha = vi.fn()
    const hb = vi.fn()
    const unsubA = realtimeClient.subscribe('project:a', ha)
    realtimeClient.subscribe('project:b', hb)
    const ws = await awaitSocket(1)
    ws.fireOpen()

    unsubA()

    expect(ws.readyState).toBe(FakeWebSocket.OPEN)
    // The unsubscribe frame went out for 'a' but the socket stays up for 'b'.
    expect(ws.sent.map((s) => JSON.parse(s))).toEqual(
      expect.arrayContaining([{ type: 'unsubscribe', channel: 'project:a' }]),
    )
  })

  it('reconnects with exponential backoff after an unexpected close', async () => {
    const h = vi.fn()
    realtimeClient.subscribe('project:p1', h)
    const ws1 = await awaitSocket(1)
    ws1.fireOpen()
    ws1.fireClose()

    // Before the backoff timer fires, no new socket.
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(1_000) // MIN_BACKOFF_MS
    const ws2 = await awaitSocket(2)
    expect(FakeWebSocket.instances).toHaveLength(2)
    ws2.fireOpen()

    // Re-subscribed on the new socket.
    expect(JSON.parse(ws2.sent[0]!)).toEqual({ type: 'subscribe', channel: 'project:p1' })

    // Backoff resets on a successful onOpen, so the next close schedules at
    // MIN_BACKOFF_MS again.
    ws2.fireClose()
    vi.advanceTimersByTime(999)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    await awaitSocket(3)
    expect(FakeWebSocket.instances).toHaveLength(3)
  })

  it('fires onResynced handlers on reconnects only, not on the first connect', async () => {
    const resynced = vi.fn()
    realtimeClient.onResynced(resynced)

    const h = vi.fn()
    realtimeClient.subscribe('project:p1', h)
    const ws1 = await awaitSocket(1)
    ws1.fireOpen()
    expect(resynced).not.toHaveBeenCalled()

    ws1.fireClose()
    vi.advanceTimersByTime(1_000)
    const ws2 = await awaitSocket(2)
    ws2.fireOpen()
    expect(resynced).toHaveBeenCalledTimes(1)
  })

  it('puts the token in the connect URL', async () => {
    realtimeClient.subscribe('project:p1', vi.fn())
    const ws = await awaitSocket(1)
    expect(ws.url).toContain('token=tok-1')
  })

  it('resolves a fresh token on every reconnect, not just the first connect', async () => {
    // The regression this whole change exists for: the socket used to read a
    // cached token, so a reconnect after the ~1h Supabase expiry retried a
    // dead token on every backoff tick, forever.
    realtimeClient.subscribe('project:p1', vi.fn())
    const ws1 = await awaitSocket(1)
    expect(ws1.url).toContain('token=tok-1')
    ws1.fireOpen()

    auth.token = 'tok-2'
    ws1.fireClose()
    vi.advanceTimersByTime(1_000)
    const ws2 = await awaitSocket(2)

    expect(ws2.url).toContain('token=tok-2')
    expect(auth.calls).toBe(2)
  })

  it('connects without a token param when none can be resolved', async () => {
    auth.token = null
    realtimeClient.subscribe('project:p1', vi.fn())
    const ws = await awaitSocket(1)
    expect(ws.url).not.toContain('token=')
  })

  it('abandons an in-flight connect when the last subscriber leaves before the token resolves', async () => {
    // The socket is constructed a microtask after `subscribe()`. Unsubscribing
    // inside that window must not leave an orphan socket that nothing holds a
    // reference to and nothing closes.
    const unsub = realtimeClient.subscribe('project:p1', vi.fn())
    unsub()

    await flush()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })
})
