import { serveCore } from '@brandfactory/core/src/server'
import { platformsFromEnv } from './env'
import { accountRoutes } from './routes'

/**
 * The server: the core, with the brands' own accounts beside it. The routes run the Pinterest
 * sign-in and read the brand's board live, and run the TikTok sign-in and send a planned video to
 * the brand's TikTok inbox as a draft. Nothing here posts: the core's connectors stay the simulated
 * ones.
 */
const platforms = platformsFromEnv()

await serveCore((core) => ({
  routes: (app) => app.route('/', accountRoutes(core, platforms)),
}))
