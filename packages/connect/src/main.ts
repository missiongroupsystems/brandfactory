import { serve } from '@hono/node-server'
import { type Authorize, createApp } from './app'
import { loadConfig } from './config'
import { openPgliteStore } from './pglite-store'
import { createProviders } from './providers'

const config = loadConfig(process.env)

// Development only: every caller may act for every brand. The host app must replace this with
// its own session and brand-grant check before this service faces real users.
const devAuthorize: Authorize = async () => ({ userId: 'dev-user' })
if (process.env.NODE_ENV === 'production') {
  throw new Error('main.ts uses devAuthorize, which trusts every caller. Wire a real check first.')
}

const store = await openPgliteStore(config.databasePath, config.encryptionKey)
const app = createApp({
  config,
  store,
  providers: createProviders(config, fetch),
  authorize: devAuthorize,
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`brandbase-connect listening on port ${info.port} (${config.publicBaseUrl})`)
})
