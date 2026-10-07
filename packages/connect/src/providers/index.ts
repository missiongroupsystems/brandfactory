import { type Config } from '../config'
import { type Fetch, type Providers } from '../platforms'
import { metaProvider } from './meta'
import { pinterestProvider } from './pinterest'
import { tiktokProvider } from './tiktok'

/** Every platform HTTP call goes through `fetch`, so tests pass a fake and never touch the network. */
export function createProviders(config: Config, fetch: Fetch): Providers {
  return {
    meta: metaProvider(config.meta, fetch),
    pinterest: pinterestProvider(config.pinterest, fetch),
    tiktok: tiktokProvider(config.tiktok, fetch),
    // youtube: Google OAuth with PKCE, scope youtube.upload, access_type=offline.
    // linkedin: Community Management API, scope w_organization_social.
  }
}
