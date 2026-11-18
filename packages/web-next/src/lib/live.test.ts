import { describe, expect, it, vi } from 'vitest'

import { changeParser, watchChanges } from './live'

/** A stream that sends `chunks`, then ends. */
const stream = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk))
        c.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )

describe('the change signal', () => {
  it('counts each changed frame, in chunks of any size, and leaves the pings out', () => {
    const changed = vi.fn()
    const push = changeParser(changed)
    // As events.ts writes them (hono's writeSSE): the event line, the data line, a blank line.
    push('event: ping\ndata: \n\n')
    push('event: changed\ndata: {"pack":"brandbase","at":"2026-11-18T09:00:00.000Z"}\n')
    expect(changed).not.toHaveBeenCalled()
    push('\nevent: chan')
    push('ged\r\ndata: {}\r\n\r\n')
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('reads the stream with the session token in the header, and opens it again after a wait that doubles', async () => {
    const changed = vi.fn()
    const live: boolean[] = []
    const waits: number[] = []
    const asked: RequestInit[] = []
    const answers = [
      () => stream(['event: changed\ndata: {}\n\n', 'event: changed\ndata: {}\n\n']),
      () => Promise.reject(new TypeError('fetch failed')),
      () => new Response('no', { status: 502 }),
      () => stream(['event: changed\ndata: {}\n\n']),
    ]
    let stop = () => {}
    const done = new Promise<void>((resolve) => {
      stop = watchChanges({
        url: 'https://core.test',
        token: async () => 'tok',
        onChanged: changed,
        onLive: (on) => live.push(on),
        wait: async (ms) => {
          waits.push(ms)
          if (waits.length === 4) {
            stop()
            resolve()
          }
        },
        fetch: (async (url: string, init: RequestInit) => {
          expect(url).toBe('https://core.test/events/brandbase')
          asked.push(init)
          return answers[asked.length - 1]!()
        }) as unknown as typeof fetch,
      })
    })
    await done
    expect(changed).toHaveBeenCalledTimes(3)
    expect(asked[0]!.headers).toMatchObject({ authorization: 'Bearer tok' })
    // After an open stream the wait starts again at a second; each failure doubles it.
    expect(waits).toEqual([1000, 2000, 4000, 1000])
    expect(live).toEqual([true, false, false, false, true, false])
  })

  it('stops reading when it is told to', async () => {
    const asked = vi.fn()
    const stop = watchChanges({
      url: 'https://core.test',
      token: async () => null,
      onChanged: () => {},
      fetch: ((_: string, init: RequestInit) => {
        asked()
        // A stream that stays open until the stop aborts it.
        return new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
        )
      }) as unknown as typeof fetch,
      wait: async () => {
        throw new Error('no wait after a stop')
      },
    })
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(1))
    stop()
    await new Promise((r) => setTimeout(r, 10))
    expect(asked).toHaveBeenCalledTimes(1)
  })
})
