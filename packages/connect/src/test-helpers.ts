import { createApp } from './app'
import { type Config } from './config'
import { openPgliteStore } from './pglite-store'
import { type Fetch } from './platforms'
import { createProviders } from './providers'

export const BASE = 'http://localhost:3010'

export const testConfig = (): Config => ({
  port: 3010,
  publicBaseUrl: BASE,
  databasePath: '',
  encryptionKey: Buffer.alloc(32, 7),
  meta: { appId: 'meta-app', appSecret: 'meta-secret', configId: 'meta-config' },
  pinterest: { appId: 'pin-app', appSecret: 'pin-secret' },
  tiktok: { clientKey: 'tt-key', clientSecret: 'tt-secret' },
})

export interface Call {
  key: string
  url: URL
  body: URLSearchParams
}

type Handler = (call: Call) => unknown

/** Answers only the routes a test names; any other request fails the test. */
export function fakeFetch(handlers: Record<string, Handler> = {}) {
  const calls: Call[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const call = {
      key: `${init?.method ?? 'GET'} ${url.origin}${url.pathname}`,
      url,
      body: new URLSearchParams(String(init?.body ?? '')),
    }
    calls.push(call)
    const handler = handlers[call.key]
    if (!handler) throw new Error(`Unexpected request: ${call.key}`)
    const result = await handler(call)
    return result instanceof Response ? result : Response.json(result)
  }) as Fetch
  return { fetch, calls, handlers }
}

export async function setup(handlers: Record<string, Handler> = {}) {
  const config = testConfig()
  const net = fakeFetch(handlers)
  const store = await openPgliteStore(undefined, config.encryptionKey)
  const providers = createProviders(config, net.fetch)
  const app = createApp({
    config,
    store,
    providers,
    authorize: async () => ({ userId: 'marketer-1' }),
  })
  return { app, store, providers, net, config }
}

/** Starts a connect flow and returns what the browser would carry to the callback. */
export async function startConnect(
  app: ReturnType<typeof createApp>,
  brand: string,
  platform: string,
) {
  const res = await app.request(`/brands/${brand}/connect/${platform}`)
  const location = new URL(res.headers.get('location') ?? '')
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  return { res, location, state: location.searchParams.get('state') ?? '', cookie }
}

export function callback(
  app: ReturnType<typeof createApp>,
  platform: string,
  query: Record<string, string>,
  cookie: string,
) {
  return app.request(`/callback/${platform}?${new URLSearchParams(query)}`, {
    headers: { cookie },
  })
}

// Canned platform answers.
export const TT_TOKEN = 'POST https://open.tiktokapis.com/v2/oauth/token/'
export const TT_USER = 'GET https://open.tiktokapis.com/v2/user/info/'
export const TT_REVOKE = 'POST https://open.tiktokapis.com/v2/oauth/revoke/'

export const tiktokToken = (
  openId: string,
  access = `act.${openId}`,
  refresh = `rft.${openId}`,
) => ({
  open_id: openId,
  scope: 'user.info.basic,video.list,video.upload',
  access_token: access,
  expires_in: 86400,
  refresh_token: refresh,
  refresh_expires_in: 31536000,
  token_type: 'Bearer',
})

export const tiktokUser = (name: string) => ({
  data: { user: { display_name: name } },
  error: { code: 'ok', message: '' },
})

/** Runs a full TikTok connect for `brand`, with the platform answering as account `openId`. */
export async function connectTikTok(
  ctx: Awaited<ReturnType<typeof setup>>,
  brand: string,
  openId: string,
  access?: string,
) {
  ctx.net.handlers[TT_TOKEN] = () => tiktokToken(openId, access)
  ctx.net.handlers[TT_USER] = () => tiktokUser(`@${openId}`)
  const { state, cookie } = await startConnect(ctx.app, brand, 'tiktok')
  return callback(ctx.app, 'tiktok', { code: 'code-1', state }, cookie)
}
