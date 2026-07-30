import './load-env'
import { serve } from '@hono/node-server'
import { pool } from '@brandfactory/db'
import type { Server as HttpServer } from 'node:http'
import { buildAdapters } from './adapters'
import { createAgentConcurrencyGuard } from './agent/concurrency'
import { createApp } from './app'
import { parseCorsAllowedOrigins } from './cors'
import { buildDbDeps } from './db'
import { loadEnv } from './env'
import { createLogger } from './logger'
import { createResearchShaper } from './research/shape'
import { createResearchTicker } from './research/ticker'
import { mountRealtime, type MountRealtimeHandle } from './ws'

async function main(): Promise<void> {
  const env = loadEnv()
  const log = createLogger({ level: env.LOG_LEVEL })
  const adapters = buildAdapters(env)
  const db = buildDbDeps()
  // The Hono app only ever needs the pub/sub surface, so it takes the bus
  // out of the discriminated `RealtimeAdapter` here. The provider-specific
  // node-ws binder stays narrowed below.
  const agentGuard = createAgentConcurrencyGuard()
  const app = createApp({
    env,
    log,
    db,
    auth: adapters.auth,
    storage: adapters.storage,
    realtime: adapters.realtime.bus,
    llm: adapters.llm,
    research: adapters.research,
    agentGuard,
  })

  // Decision 7's other half: the row survives a closed browser, and this is
  // what finishes the run nobody is watching. Single-instance, like the
  // realtime bus it sits beside — see the module comment.
  const researchTicker = createResearchTicker({
    db,
    research: adapters.research,
    env,
    // The sweep shapes too — a job that finishes while nobody is watching must
    // arrive with its drafts, not with a report and an empty review sheet.
    shape: createResearchShaper({ db, llm: adapters.llm, env }),
    logger: log,
  })
  if (env.RESEARCH_PROVIDER !== 'none') researchTicker.start()

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
      hostname: env.HOST,
    },
    (info) => log.info('listening', { port: info.port, host: env.HOST }),
  ) as unknown as HttpServer

  // Only the native-ws realtime impl exposes `bindToNodeWebSocketServer`.
  // Narrowing on the discriminator forces every future impl to declare its
  // own upgrade strategy — the `never` assertion in the default branch
  // turns a missing case into a TS error.
  const allowedOrigins = parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS)
  let ws: MountRealtimeHandle
  switch (adapters.realtime.provider) {
    case 'native-ws':
      ws = mountRealtime({
        httpServer: server,
        realtime: adapters.realtime.bus,
        auth: adapters.auth,
        db,
        log,
        allowedOrigins,
      })
      break
    default: {
      const _exhaustive: never = adapters.realtime.provider
      throw new Error(`unsupported realtime provider: ${String(_exhaustive)}`)
    }
  }

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('shutdown: signal received', { signal })
    try {
      // Before the pool closes: a sweep mid-flight would query a dead pool.
      // **Awaited**, because clearing the interval does not stop the sweep that
      // is already inside a vendor poll — and the write that sweep is on its way
      // to make is `finishResearchJob` for a run that has completed and been
      // billed. Losing it strands a paid job `IN_PROGRESS` until the ceiling.
      await researchTicker.stop()
      await ws.close()
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      )
      await pool.end()
      log.info('shutdown: complete')
      process.exit(0)
    } catch (err) {
      log.error('shutdown: failed', {
        name: (err as Error).name,
        message: (err as Error).message,
      })
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  // Pre-logger failures (env load, adapter build) land here.
  console.error(err)
  process.exit(1)
})
