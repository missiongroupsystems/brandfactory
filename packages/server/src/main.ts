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
import { createPassportReconciler } from './passport/reconcile'
import { loadPassportPlacement } from './passport/registry'
import { createPassportBearerVerifier } from './passport/verify-bearer'
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

  // Step 0 of the Passport integration: this app's PLACEMENT — which unit types
  // may hold its roles, and whether a parent's role reaches the outlets beneath
  // it. Read here and nowhere else, because the app registry is **not a synced
  // aggregate**: no event announces a change and `snapshot()` does not carry it,
  // so a re-scope needs a restart.
  //
  // Awaited before the server starts listening, so no request can reach the access
  // derivation before the answer exists. It never throws — an unreachable registry
  // falls back to brand-only and logs that it did, because refusing to boot would
  // make Passport a hard dependency for serving app-native users.
  //
  // Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 4a.
  await loadPassportPlacement(env, log)

  // ONE verifier, handed to BOTH the HTTP middleware and the websocket upgrade. Two
  // instances would be harmless; two code paths would not — that asymmetry is what
  // gave a hosted-login user working requests and a socket that silently refused to
  // open.
  const verifyBearer = createPassportBearerVerifier(env, adapters.auth)

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
    verifyBearer,
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

  // Part three of reconciliation: the SCHEDULE. The function and the endpoint are
  // both useless without it, and writing only those two is the common failure —
  // they pass their own tests, so the suite is green while nothing ever runs.
  //
  // Started only when the API credentials exist, because the function throws
  // without them and a sweep that always fails is noise rather than a backstop.
  // Single-instance, like the research ticker beside it and for the same reason —
  // see `passport/reconcile.ts`.
  const passportReconciler = createPassportReconciler({ env, log })
  if (env.PASSPORT_API_URL && env.PASSPORT_API_KEY) {
    passportReconciler.start()
  } else {
    log.info('passport reconcile: not scheduled (PASSPORT_API_URL / PASSPORT_API_KEY unset)')
  }

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
        verifyBearer,
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
      // Same reason: a sweep sitting inside a snapshot read would otherwise
      // resume after `pool.end()` and write against a dead pool.
      await passportReconciler.stop()
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
