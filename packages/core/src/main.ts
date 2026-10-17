import { mkdirSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { createCore } from './app'
import { openPglite, openPostgres } from './db'
import { loadEnv } from './env'
import { migrateCore } from './migrate'

/**
 * The core server. It reads the live version of a pack on every call, so publishing, testing and
 * promoting a version (`cli.ts`) need no restart. On PGlite it applies the core's migrations on
 * start; on a Postgres server `core migrate` does.
 */
const env = loadEnv()
let db
if (env.databaseUrl) {
  db = openPostgres(env.databaseUrl)
} else {
  mkdirSync(env.pgliteDir, { recursive: true })
  db = openPglite(env.pgliteDir)
  await migrateCore(db)
}

const app = createCore(
  { db, auth: env.auth, environment: env.environment, now: env.now },
  { corsOrigins: env.corsOrigins },
)
const server = serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) =>
  console.info(`core on :${info.port}, environment ${env.environment}`),
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => void db.close().then(() => process.exit(0)))
    // Open keep-alive connections would hold the close; stop waiting after a few seconds.
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
