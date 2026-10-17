import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Refused } from './errors'
import { approve } from './effects'
import { events } from './events'
import { mcp } from './mcp'
import { call, type CoreDeps } from './run'

/** The largest input a move takes, in characters. */
const MAX_BODY = 1_000_000

/** A move's input: the JSON body, or `{}` when there is none. */
async function readInput(body: Promise<string>): Promise<unknown> {
  const text = await body
  if (text.length > MAX_BODY) throw new Refused(413, 'TOO_LARGE', 'the body is too large')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Refused(400, 'VALIDATION', 'the body is not JSON')
  }
}

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

  // A person's yes to what an effect move would send now (`effects.ts`).
  app.on('POST', '/approve/:pack/:op', async (c) => {
    const input = await readInput(c.req.text())
    const result = await approve(deps, {
      authorization: c.req.header('authorization'),
      pack: c.req.param('pack'),
      op: c.req.param('op'),
      input,
    })
    return c.json(result)
  })

  // "Something changed" for open screens (`events.ts`). A browser's EventSource sends no
  // header, so the token may come as `?token=`.
  app.get('/events/:pack', (c) => {
    const token = c.req.query('token')
    if (token && !c.req.header('authorization'))
      c.req.raw.headers.set('authorization', `Bearer ${token}`)
    return events(deps, c)
  })

  // The live version's moves as MCP tools, for agents (`mcp.ts`).
  app.on('POST', '/mcp/:pack', (c) => mcp(deps, c))

  app.on('POST', '/ops/:pack/:op', async (c) => {
    const input = await readInput(c.req.text())
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
