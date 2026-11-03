import { serveCore } from '@brandfactory/core/src/server'
import { platformsFromEnv } from './env'
import { socialConnector } from './make'
import { metaSender } from './meta-post'
import { accountRoutes } from './routes'

/**
 * The server: the core, with the brands' own accounts beside it. The routes run the Pinterest
 * sign-in and read the brand's board live, run the TikTok sign-in and send a planned video to the
 * brand's TikTok inbox as a draft, and keep each brand's Instagram account and Facebook Page. The
 * `social` connector posts due Instagram and Facebook jobs through our own Meta app for an account
 * linked by its sign-in, through Make otherwise, and refuses every other account.
 */
const platforms = platformsFromEnv()

await serveCore((core) => {
  const signedReadUrl =
    core.files && ((key: string, ttl: number) => core.files!.store.signedReadUrl(key, ttl))
  return {
    connectors: {
      social: socialConnector({
        make: platforms.make,
        meta: platforms.meta && metaSender(core, platforms.meta, signedReadUrl),
        signedReadUrl,
      }),
    },
    routes: (app) => app.route('/', accountRoutes(core, platforms)),
  }
})
