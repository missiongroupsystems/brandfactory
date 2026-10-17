import { EventEmitter } from 'node:events'
import { type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Refused } from './errors'
import { authenticate, type CoreDeps, PATH_PART } from './run'

/**
 * "Something in this pack changed", pushed to open screens within a second, so the calendar
 * shows a send's result without a reload. The event carries no data: a screen reads its state
 * again through its moves, under its own row rules, so nobody learns another company's change.
 * One process holds the subscribers; the core runs as one instance.
 */
const bus = new EventEmitter()
bus.setMaxListeners(0)

/** Called after every committed write or effect, and when a scheduled call ends. */
export function changed(pack: string) {
  bus.emit(`pack:${pack}`, { pack, at: new Date().toISOString() })
}

/** `GET /events/:pack`: server-sent events for a signed-in caller. */
export async function events(deps: CoreDeps, c: Context) {
  const principal = await authenticate(deps.auth, c.req.header('authorization'))
  const pack = c.req.param('pack')!
  if (!PATH_PART.test(pack)) throw new Refused(404, 'PACK_NOT_LIVE', 'no such pack')
  const [who] = await deps.db.query('select 1 from packs.principals where id = $1', [principal])
  if (!who) throw new Refused(403, 'NO_ACCOUNT', 'this account has no access')
  // Prefixed, so no pack name can be one of the emitter's own events (`error`, `newListener`).
  const topic = `pack:${pack}`
  return streamSSE(c, async (stream) => {
    const send = (e: { pack: string; at: string }) =>
      void stream.writeSSE({ event: 'changed', data: JSON.stringify(e) })
    bus.on(topic, send)
    stream.onAbort(() => {
      bus.off(topic, send)
    })
    // Keeps proxies from closing a quiet stream; ends when the client goes.
    while (!stream.aborted) {
      await stream.writeSSE({ event: 'ping', data: '' })
      await stream.sleep(25_000)
    }
    bus.off(topic, send)
  })
}
