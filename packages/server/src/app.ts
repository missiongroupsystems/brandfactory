import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { type AuthProvider } from './auth'
import { brandsOf, requireBrand } from './authz'
import { type AppEnv } from './context'
import { type Db } from './db/client'
import { type crew, type shoots, users } from './db/schema'
import { ZodError } from 'zod'
import { HttpError, deactivated, noAccount, notFound, unauthorized } from './errors'
import { connectionRoutes } from './routes/connections'
import { ideaRoutes } from './routes/ideas'
import { inboxRoutes } from './routes/inbox'
import { kitRoutes } from './routes/kit'
import { MAX_UPLOAD_BYTES, mediaReadRoute, mediaRoutes, typeOfKey } from './routes/media'
import { postRoutes } from './routes/posts'
import { sendRoute } from './routes/send'
import { guestRoutes, teamCommentRoutes, teamShareRoutes } from './routes/share'
import { type BrandEnv } from './routes/shared'
import { shootRoutes } from './routes/shoots'
import { stateRoute } from './routes/state'
import { type BlobStore, type diskStore } from './storage'
import { type instantOf } from './time'

/** Sends the Lark invite. No Lark provider exists yet (see the plan); the default does nothing. */
export interface InviteSender {
  send(
    brandId: string,
    shoot: typeof shoots.$inferSelect,
    people: (typeof crew.$inferSelect)[],
  ): Promise<void>
}

export interface Deps {
  db: Db
  auth: AuthProvider
  /** The clock every "today" reads; tests and the demo pin it. */
  now: () => Date
  instantOf: typeof instantOf
  invites: InviteSender
  /** Browser origins allowed to call the API; empty means same origin only. */
  corsOrigins: string[]
  storage: BlobStore
  /** The local disk store, whose files the API serves at `/blobs`; absent on Supabase. */
  disk?: ReturnType<typeof diskStore>
  /** This API's own address, for the media links it hands out. */
  publicUrl: string
  /** Signs media links; changing it breaks every link handed out. */
  mediaSecret: string
}

function bearer(header: string | undefined) {
  const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null
  return match ? match[1]!.trim() : null
}

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>()

  if (deps.corsOrigins.length > 0) {
    app.use('*', cors({ origin: deps.corsOrigins, credentials: false, maxAge: 600 }))
  }

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(
        {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined && { details: err.details }),
        },
        err.status as 400,
      )
    }
    if (err instanceof ZodError) {
      return c.json({ code: 'VALIDATION', message: 'validation failed', details: err.issues }, 400)
    }
    console.error(err)
    return c.json({ code: 'INTERNAL', message: 'something went wrong' }, 500)
  })

  app.get('/health', (c) => c.json({ ok: true }))

  // Outside the sign-in on purpose: a guest has no account, and an <img> sends no token. The
  // token or the signature in the path is the capability.
  app.route('/share', guestRoutes(deps))
  app.route('/media', mediaReadRoute(deps))
  const disk = deps.disk
  if (disk) {
    app.put('/blobs/*', async (c) => {
      const key = c.req.path.slice('/blobs/'.length)
      if (!disk.allowed('put', key, c.req.query('exp') ?? '', c.req.query('sig') ?? '')) {
        throw notFound()
      }
      const bytes = new Uint8Array(await c.req.arrayBuffer())
      if (bytes.byteLength > MAX_UPLOAD_BYTES)
        throw new HttpError(413, 'TOO_LARGE', 'file too large')
      await disk.write(key, bytes)
      return c.body(null, 200)
    })
    app.get('/blobs/*', async (c) => {
      const key = c.req.path.slice('/blobs/'.length)
      if (!disk.allowed('get', key, c.req.query('exp') ?? '', c.req.query('sig') ?? '')) {
        throw notFound()
      }
      const bytes = await disk.read(key).catch(() => null)
      if (!bytes) throw notFound()
      // A named type, never sniffed: an uploaded page must not run on the API's origin.
      c.header('content-type', typeOfKey(key))
      c.header('x-content-type-options', 'nosniff')
      return c.body(new Uint8Array(bytes))
    })
  }

  /**
   * The door. A valid token proves who somebody is, not that they belong here: a token with no
   * `users` row is refused, and nothing creates one on sign-in.
   */
  const signedIn = createMiddleware<AppEnv>(async (c, next) => {
    const token = bearer(c.req.header('authorization'))
    if (!token) throw unauthorized('missing bearer token')
    let userId: string
    try {
      userId = (await deps.auth.verifyToken(token)).userId
    } catch {
      throw unauthorized('invalid token')
    }
    const [user] = await deps.db.select().from(users).where(eq(users.id, userId))
    if (!user) throw noAccount()
    if (user.deactivatedAt) throw deactivated()
    c.set('user', user)
    await next()
  })
  app.use('/me', signedIn)
  app.use('/brands/*', signedIn)
  app.use('/brands', signedIn)

  app.get('/me', async (c) => {
    const user = c.var.user
    return c.json({ user, brands: await brandsOf(deps.db, user) })
  })
  app.get('/brands', async (c) => c.json(await brandsOf(deps.db, c.var.user)))

  const brand = new Hono<BrandEnv>()
  brand.use('*', async (c, next) => {
    c.set('brand', await requireBrand(deps.db, c.var.user, c.req.param('brandId')!))
    await next()
  })
  brand.route('/state', stateRoute(deps))
  brand.route('/posts', postRoutes(deps))
  brand.route('/ideas', ideaRoutes(deps))
  brand.route('/shoots', shootRoutes(deps))
  brand.route('/posts', sendRoute(deps))
  brand.route('/media', mediaRoutes(deps))
  brand.route('/share', teamShareRoutes(deps))
  brand.route('/comments', teamCommentRoutes(deps))
  brand.route('/inbox', inboxRoutes(deps))
  brand.route('/kit', kitRoutes(deps))
  brand.route('/connections', connectionRoutes(deps))
  app.route('/brands/:brandId', brand)

  return app
}
