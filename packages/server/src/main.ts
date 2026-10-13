import { mkdirSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { devAuth, supabaseAuth } from './auth'
import { openPglite, openPostgres } from './db/client'
import { loadEnv } from './env'
import { runDueJobs, simulatedPublisher } from './jobs'
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
})

// One runner: the server runs as one instance, as the archive's did. The claim in `runDueJobs`
// still keeps a second one from sending a job twice.
//
// Only the simulated publisher exists, and it marks every job live. Posted is final, so on a real
// database it would mark posts as out that never went out: there the runner stays off and jobs
// wait as scheduled until a real publisher lands.
let running = false
const ticker = env.DATABASE_URL
  ? undefined
  : setInterval(() => {
      if (running) return
      running = true
      runDueJobs({ db: handle.db, now, publisher: simulatedPublisher })
        .catch((err) => console.error('job runner', err))
        .finally(() => (running = false))
    }, env.JOB_INTERVAL_S * 1000)
if (!ticker) console.warn('job runner off: no real publisher yet, so posts stay scheduled')

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) =>
  console.info(`brandbase server on :${info.port}`),
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(ticker)
    server.close(() => void handle.close().then(() => process.exit(0)))
  })
}
