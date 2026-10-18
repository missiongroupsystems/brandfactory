import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Refused } from './errors'
import { approve } from './effects'
import { events } from './events'
import { type DiskFiles, keyOfSrc, MAX_FILE_BYTES, typeOfKey } from './files'
import { callGuest } from './guest'
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
export function createCore(
  deps: CoreDeps,
  opts: { corsOrigins?: string[]; disk?: DiskFiles } = {},
) {
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

  // A file's stable address, outside the sign-in on purpose: an <img> sends no token. The
  // signature is the right; it sends the browser on to a short-lived storage URL.
  app.get('/files/:sig/*', async (c) => {
    const files = deps.files
    const key = c.req.path.split('/').slice(3).join('/')
    if (!files || !keyOfSrc(files, c.req.param('sig'), key)) {
      throw new Refused(404, 'NOT_FOUND', 'not found')
    }
    c.header('cache-control', 'private, max-age=300')
    return c.redirect(await files.store.signedReadUrl(key, 3600), 302)
  })

  // Files on this machine (`diskFiles`), for development: a signed URL writes or reads one.
  const disk = opts.disk
  if (disk) {
    app.put('/blobs/*', async (c) => {
      const key = c.req.path.slice('/blobs/'.length)
      if (!disk.allowed('put', key, c.req.query('exp') ?? '', c.req.query('sig') ?? '')) {
        throw new Refused(404, 'NOT_FOUND', 'not found')
      }
      // Its length first, so a body too large is refused before it is read.
      const length = Number(c.req.header('content-length'))
      if (!Number.isInteger(length) || length < 0) {
        throw new Refused(411, 'LENGTH_REQUIRED', 'send the file with its length')
      }
      if (length > MAX_FILE_BYTES) throw new Refused(413, 'TOO_LARGE', 'the file is too large')
      const bytes = new Uint8Array(await c.req.arrayBuffer())
      if (bytes.byteLength > MAX_FILE_BYTES) {
        throw new Refused(413, 'TOO_LARGE', 'the file is too large')
      }
      if (!(await disk.write(key, bytes))) {
        throw new Refused(409, 'EXISTS', 'a file is stored there already')
      }
      return c.body(null, 200)
    })
    app.get('/blobs/*', async (c) => {
      const key = c.req.path.slice('/blobs/'.length)
      if (!disk.allowed('get', key, c.req.query('exp') ?? '', c.req.query('sig') ?? '')) {
        throw new Refused(404, 'NOT_FOUND', 'not found')
      }
      const bytes = await disk.read(key).catch(() => null)
      if (!bytes) throw new Refused(404, 'NOT_FOUND', 'not found')
      // A named type, never sniffed: an uploaded page must not run on the core's origin.
      c.header('content-type', typeOfKey(key))
      c.header('x-content-type-options', 'nosniff')
      return c.body(new Uint8Array(bytes))
    })
  }

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

  // A guest's move, with no sign-in: the capability in its input is the right (`guest.ts`). The
  // address is Fly's, which a client cannot set; off Fly every guest shares one count.
  app.on('POST', '/guest/:pack/:op', async (c) => {
    const input = await readInput(c.req.text())
    const result = await callGuest(deps, {
      address: c.req.header('fly-client-ip') ?? 'direct',
      pack: c.req.param('pack'),
      op: c.req.param('op'),
      input,
    })
    return c.json(result ?? null)
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
