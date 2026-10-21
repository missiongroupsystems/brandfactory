import { mkdirSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { devAuth, supabaseAuth } from './auth'
import { openPglite, openPostgres } from './db/client'
import { loadEnv } from './env'
import { claimDueJobs, sendJob, simulatedPublisher } from './jobs'
import { platformPublisher } from './publish'
import { metaApp } from './meta'
import { pinterestApp } from './pinterest'
import { tiktokApp } from './tiktok'
import { diskStore, supabaseStore } from './storage'
import { instantOf } from './time'

const env = loadEnv()

let handle
if (env.DATABASE_URL) {
  handle = openPostgres(env.DATABASE_URL, env.DATABASE_POOL_MAX)
} else {
  mkdirSync(env.PGLITE_DIR, { recursive: true })
  handle = await openPglite(env.PGLITE_DIR)
}

const pinned = env.PIN_NOW ? new Date(env.PIN_NOW) : null
const now = () => pinned ?? new Date()

const disk =
  env.STORAGE_PROVIDER === 'disk'
    ? diskStore({ root: env.BLOB_DIR, secret: env.MEDIA_SIGNING_SECRET, baseUrl: env.PUBLIC_URL })
    : undefined
const storage =
  disk?.store ??
  supabaseStore({
    url: env.SUPABASE_URL!,
    serviceKey: env.SUPABASE_SERVICE_KEY!,
    bucket: env.SUPABASE_STORAGE_BUCKET,
  })

const meta = env.META_APP_ID
  ? metaApp({
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET!,
      configId: env.META_CONFIG_ID!,
      redirectUrl: env.META_REDIRECT_URL!,
      masterKey: Buffer.from(env.TOKEN_ENCRYPTION_KEY!, 'base64'),
    })
  : undefined
const tiktok = env.TIKTOK_CLIENT_KEY
  ? tiktokApp({
      clientKey: env.TIKTOK_CLIENT_KEY,
      clientSecret: env.TIKTOK_CLIENT_SECRET!,
      redirectUrl: env.TIKTOK_REDIRECT_URL!,
      masterKey: Buffer.from(env.TOKEN_ENCRYPTION_KEY!, 'base64'),
    })
  : undefined

const app = createApp({
  db: handle.db,
  auth:
    env.AUTH_PROVIDER === 'supabase'
      ? supabaseAuth({
          jwksUrl: env.SUPABASE_JWKS_URL!,
          issuer: env.SUPABASE_JWT_ISSUER,
          audience: env.SUPABASE_JWT_AUDIENCE,
        })
      : devAuth(),
  now,
  instantOf,
  invites: {
    async send(brandId, shoot, people) {
      console.info('lark invite (not sent: no Lark provider yet)', brandId, shoot.id, people.length)
    },
  },
  corsOrigins: env.CORS_ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  storage,
  disk,
  publicUrl: env.PUBLIC_URL,
  mediaSecret: env.MEDIA_SIGNING_SECRET,
  pinterest: env.PINTEREST_APP_ID
    ? pinterestApp({
        appId: env.PINTEREST_APP_ID,
        appSecret: env.PINTEREST_APP_SECRET!,
        redirectUrl: env.PINTEREST_REDIRECT_URL!,
        masterKey: Buffer.from(env.TOKEN_ENCRYPTION_KEY!, 'base64'),
      })
    : undefined,
  meta,
  tiktok,
})

// One runner: the server runs as one instance, as the archive's did. The claim in `claimDueJobs`
// still keeps a second one from sending a job twice.
//
// With a platform app set up, jobs go to the platforms. Without one, only the simulated publisher
// exists, and it marks every job live: on a real database that would mark posts as out that never
// went out, so there the runner stays off and jobs wait as scheduled.
const real = Boolean(meta || tiktok)
const publisher = real
  ? platformPublisher({ db: handle.db, storage, now, meta, tiktok })
  : simulatedPublisher
/** At most this many jobs on their way at once; each tick tops up to it. */
const IN_FLIGHT_MAX = 10
const inFlight = new Set<Promise<void>>()
let claiming: Promise<void> | null = null
const ticker =
  env.DATABASE_URL && !real
    ? undefined
    : setInterval(() => {
        // Claiming is quick; sending is not, so a slow job never holds up the jobs due after it.
        if (claiming) return
        claiming = claimDueJobs({ db: handle.db, now }, IN_FLIGHT_MAX - inFlight.size)
          .then((claimed) => {
            for (const job of claimed) {
              const sending = sendJob({ db: handle.db, now, publisher }, job).finally(() =>
                inFlight.delete(sending),
              )
              inFlight.add(sending)
            }
          })
          .catch((err) => console.error('job runner', err))
          .finally(() => (claiming = null))
      }, env.JOB_INTERVAL_S * 1000)
if (!ticker) console.warn('job runner off: no platform app set up, so posts stay scheduled')

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) =>
  console.info(`brandbase server on :${info.port}`),
)

/** How long a stop waits for jobs on their way, inside Fly's `kill_timeout` (fly.toml). */
const STOP_WAIT_MS = 4 * 60 * 1000

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(ticker)
    // Jobs on their way finish before the database closes, the ones a claim under way is about to
    // start included; one still going when the wait ends stays `uploading`, and the stuck sweep
    // fails it with "check the account".
    const done = Promise.resolve(claiming).then(() => Promise.allSettled([...inFlight]))
    const waited = new Promise((r) => setTimeout(r, STOP_WAIT_MS).unref())
    server.close(
      () =>
        void Promise.race([done, waited])
          .then(() => handle.close())
          .then(() => process.exit(0)),
    )
  })
}
