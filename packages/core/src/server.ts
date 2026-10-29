import { mkdirSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { type Hono } from 'hono'
import { agentTokens, withAgentTokens } from './agents'
import { createCore } from './app'
import { simulatedConnector } from './effects'
import { feedConnector } from './feeds'
import { startScheduler, STOP_WAIT_MS } from './scheduler'
import { openPglite, openPostgres } from './db'
import { type CoreEnv, loadEnv } from './env'
import { migrateCore } from './migrate'
import { type Connector, type CoreDeps } from './run'

/** What a host adds to the core: connectors by name, and routes of its own. */
export interface Extension {
  connectors?: Record<string, Connector>
  routes?: (app: Hono) => void
}

/**
 * The core server. It reads the live version of a pack on every call, so publishing, testing and
 * promoting a version (`cli.ts`) need no restart. On PGlite it applies the core's migrations on
 * start; on a Postgres server `core migrate` does. A host may add connectors and routes.
 */
export async function serveCore(extend?: (deps: CoreDeps, env: CoreEnv) => Extension) {
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
  const deps: CoreDeps = {
    db,
    auth: withAgentTokens(env.auth, agents, env.now),
    agents,
    environment: env.environment,
    now: env.now,
    // Real connectors come with the platforms' reviews (and a Lark provider); until then
    // nothing leaves the core.
    connectors: {
      simulated: simulatedConnector,
      lark: simulatedConnector,
      // Read-only: the Mission Events feed, with its service key in `X-Service-Key`.
      ...(env.missionEvents && {
        mission_events: feedConnector({
          url: env.missionEvents.url,
          header: 'X-Service-Key',
          key: env.missionEvents.key,
        }),
      }),
    },
    files: env.files,
  }
  const extension = extend?.(deps, env) ?? {}
  deps.connectors = { ...deps.connectors, ...extension.connectors }
  const app = createCore(deps, { corsOrigins: env.corsOrigins, disk: env.disk })
  extension.routes?.(app)
  // One loop: the core runs as one instance. The claim still keeps a second from running a call
  // twice.
  const stopScheduler = startScheduler(deps)

  const server = serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) =>
    console.info(`core on :${info.port}, environment ${env.environment}`),
  )

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.close()
      // Running sends finish first (up to four minutes; Fly's kill_timeout allows five), then
      // the pool closes. Open keep-alive connections would hold the close, so it is not awaited.
      void stopScheduler()
        .then(() => db.close())
        .finally(() => process.exit(0))
      setTimeout(() => process.exit(0), STOP_WAIT_MS + 10_000).unref()
    })
  }
}
