/**
 * The core's "something changed" signal (`GET /events/:pack`, packages/core/src/events.ts), read
 * as a fetch stream so the session token goes in the header, not the address. Each frame is
 * `event: changed` with no data a screen needs: the screen reads its state again through its
 * moves. A `ping` frame comes every 25 seconds to keep the stream open. A stream that ends or
 * fails opens again after a wait that doubles each time, up to 30 seconds.
 */

import { PACK } from './core-routes'

/** The first wait before the stream opens again, and the longest. */
export const RETRY_FIRST_MS = 1000
export const RETRY_MAX_MS = 30_000

/** Calls `onChanged` once for each `changed` frame in the chunks it is given. */
export function changeParser(onChanged: () => void) {
  let buffer = ''
  const frame = (block: string) => {
    for (const line of block.split('\n')) {
      if (line === 'event: changed' || line === 'event:changed') {
        onChanged()
        return
      }
    }
  }
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n?/g, '\n')
    let end = buffer.indexOf('\n\n')
    while (end >= 0) {
      frame(buffer.slice(0, end))
      buffer = buffer.slice(end + 2)
      end = buffer.indexOf('\n\n')
    }
  }
}

export interface Watch {
  /** The core's address. */
  url: string
  /** The session token, fresh; null when signed out. */
  token: () => Promise<string | null>
  onChanged: () => void
  /** True while the stream is open; false once it fails or ends. */
  onLive?: (live: boolean) => void
  /** For tests: the wait before a new try. */
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
  fetch?: typeof fetch
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })

/** Reads the signal until the returned function is called. */
export function watchChanges({
  url,
  token,
  onChanged,
  onLive,
  wait = sleep,
  fetch: doFetch = fetch,
}: Watch): () => void {
  const stop = new AbortController()
  const { signal } = stop
  void (async () => {
    let retry = RETRY_FIRST_MS
    while (!signal.aborted) {
      try {
        const bearer = await token()
        const res = await doFetch(`${url}/events/${PACK}`, {
          headers: {
            accept: 'text/event-stream',
            ...(bearer && { authorization: `Bearer ${bearer}` }),
          },
          signal,
        })
        if (res.ok && res.body) {
          onLive?.(true)
          retry = RETRY_FIRST_MS
          const push = changeParser(onChanged)
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            push(decoder.decode(value, { stream: true }))
          }
        }
      } catch {
        // A network failure or the stop: the loop decides.
      }
      if (signal.aborted) break
      onLive?.(false)
      await wait(retry, signal)
      retry = Math.min(retry * 2, RETRY_MAX_MS)
    }
  })()
  return () => stop.abort()
}
