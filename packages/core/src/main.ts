import { mkdirSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { agentTokens, withAgentTokens } from './agents'
import { createCore } from './app'
import { simulatedConnector } from './effects'
import { startScheduler } from './scheduler'
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
  db = openPostgres(env.databaseUrl, 5, { prepare: env.prepare })
} else {
  mkdirSync(env.pgliteDir, { recursive: true })
  db = openPglite(env.pgliteDir)
  await migrateCore(db)
}

const agents = agentTokens(env.agentSecret)
const deps = {
  db,
  auth: withAgentTokens(env.auth, agents, env.now),
  agents,
  environment: env.environment,
  now: env.now,
  // Real connectors come with the platforms' reviews (and a Lark provider); until then
  // nothing leaves the core.
  connectors: { simulated: simulatedConnector, lark: simulatedConnector },
  files: env.files,
}
const app = createCore(deps, { corsOrigins: env.corsOrigins, disk: env.disk })
// One loop: the core runs as one instance. The claim still keeps a second from running a call
// twice.
const stopScheduler = startScheduler(deps)

const server = serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) =>
  console.info(`core on :${info.port}, environment ${env.environment}`),
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopScheduler()
    server.close(() => void db.close().then(() => process.exit(0)))
    // Open keep-alive connections would hold the close; stop waiting after a few seconds.
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
