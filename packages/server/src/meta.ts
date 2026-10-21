import { expiringSealer, tokenSealer } from './crypto'

const VERSION = 'v26.0'
export const GRAPH = `https://graph.facebook.com/${VERSION}`
const DIALOG = `https://www.facebook.com/${VERSION}/dialog/oauth`
const TEN_MINUTES = 10 * 60 * 1000

export interface MetaConfig {
  appId: string
  appSecret: string
  /** The Facebook Login for Business configuration that lists the permissions. */
  configId: string
  /** The web app's `/connect/meta`, as registered on the Meta app. */
  redirectUrl: string
  /** `TOKEN_ENCRYPTION_KEY`, decoded. */
  masterKey: Buffer
  fetch?: typeof fetch
}

/** A Facebook Page the person may pick, with its Instagram business account when it has one. */
export interface MetaPage {
  id: string
  name: string
  /** The Page token. It does not expire when read with a long-lived user token. */
  token: string
  igUserId: string | null
  igUsername: string | null
}

/** The token is dead (Meta's code 190): someone must connect again. */
export class MetaReconnect extends Error {}

/** Meta refused, with its own words; `code` is Meta's error code. */
export class MetaError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message)
  }
}

interface GraphError {
  error?: { message: string; code: number; error_user_msg?: string }
}

/**
 * The Graph API for the Facebook Page (and its Instagram account) each brand posts to. Facebook
 * Login for Business: the permissions live in the configuration `configId` names, so the dialog
 * sends `config_id` and no `scope`.
 */
export function metaApp(config: MetaConfig) {
  const doFetch = config.fetch ?? fetch
  const state = expiringSealer<{ userId: string; brandId: string }>(
    config.masterKey,
    'meta-state',
    TEN_MINUTES,
  )
  const choice = expiringSealer<{ userId: string; brandId: string; pages: MetaPage[] }>(
    config.masterKey,
    'meta-choice',
    TEN_MINUTES,
  )
  const tokens = tokenSealer<{ pageToken: string }>(config.masterKey, 'meta-tokens')

  /** One Graph call. GET with query parameters, or POST with a form body. */
  async function graph<T>(
    path: string,
    params: Record<string, string>,
    method: 'GET' | 'POST' = 'GET',
  ): Promise<T> {
    const query = new URLSearchParams(params)
    // A minute at most: a job's whole time on the platform is bounded (`JOB_BUDGET_MS`).
    const signal = AbortSignal.timeout(60_000)
    const res =
      method === 'GET'
        ? await doFetch(`${GRAPH}${path}?${query}`, { signal })
        : await doFetch(`${GRAPH}${path}`, { method: 'POST', body: query, signal })
    const body = (await res.json().catch(() => ({}))) as T & GraphError
    if (body.error) {
      // 190 is "invalid OAuth access token": expired, revoked, or the password changed.
      if (body.error.code === 190) throw new MetaReconnect(body.error.message)
      throw new MetaError(body.error.error_user_msg ?? body.error.message, body.error.code)
    }
    if (!res.ok) throw new MetaError(`HTTP ${res.status}`, null)
    return body
  }

  return {
    graph,
    sealState: state.seal,
    openState: state.open,
    sealChoice: choice.seal,
    openChoice: choice.open,
    sealTokens: tokens.seal,
    openTokens: tokens.open,

    authorizeUrl(sealedState: string) {
      const params = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: config.redirectUrl,
        state: sealedState,
        config_id: config.configId,
        response_type: 'code',
      })
      return `${DIALOG}?${params}`
    },

    /** The code from the redirect, for the Pages the person manages, each with its Page token. */
    async pagesFor(code: string): Promise<MetaPage[]> {
      const credentials = { client_id: config.appId, client_secret: config.appSecret }
      const short = await graph<{ access_token: string }>('/oauth/access_token', {
        ...credentials,
        redirect_uri: config.redirectUrl,
        code,
      })
      const long = await graph<{ access_token: string }>('/oauth/access_token', {
        ...credentials,
        grant_type: 'fb_exchange_token',
        fb_exchange_token: short.access_token,
      })
      const pages = await graph<{
        data: {
          id: string
          name: string
          access_token?: string
          instagram_business_account?: { id: string; username?: string }
        }[]
      }>('/me/accounts', {
        fields: 'id,name,access_token,instagram_business_account{id,username}',
        limit: '100',
        access_token: long.access_token,
      })
      return pages.data.flatMap((p) =>
        p.access_token
          ? [
              {
                id: p.id,
                name: p.name,
                token: p.access_token,
                igUserId: p.instagram_business_account?.id ?? null,
                igUsername: p.instagram_business_account?.username ?? null,
              },
            ]
          : [],
      )
    },
  }
}

export type MetaApp = ReturnType<typeof metaApp>
