import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Refused } from './errors'
import { call, type CoreDeps } from './run'

/** The largest input a move takes, in characters. */
const MAX_BODY = 1_000_000

/** The core's HTTP door: one route for every pack's moves. */
export function createCore(deps: CoreDeps, opts: { corsOrigins?: string[] } = {}) {
  const app = new Hono()

  // Browser origins allowed to call (the screens); none means same origin only.
  if (opts.corsOrigins?.length) {
    app.use('*', cors({ origin: opts.corsOrigins, credentials: false, maxAge: 600 }))
  }

  app.onError((err, c) => {
    if (err instanceof Refused) return c.json(err.toJSON(), err.status as 400)
    console.error(err)
    return c.json({ code: 'INTERNAL', message: 'something went wrong' }, 500)
  })

  app.get('/health', (c) => c.json({ ok: true }))

  app.on('POST', '/ops/:pack/:op', async (c) => {
    const text = await c.req.text()
    if (text.length > MAX_BODY) throw new Refused(413, 'TOO_LARGE', 'the body is too large')
    let input: unknown = {}
    if (text.trim() !== '') {
      try {
        input = JSON.parse(text)
      } catch {
        throw new Refused(400, 'VALIDATION', 'the body is not JSON')
      }
    }
    const result = await call(deps, {
      authorization: c.req.header('authorization'),
      pack: c.req.param('pack'),
      op: c.req.param('op'),
      input,
      key: c.req.header('idempotency-key'),
    })
    return c.json(result ?? null)
  })

  return app
}
