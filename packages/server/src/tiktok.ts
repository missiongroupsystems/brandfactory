import { expiringSealer, tokenSealer } from './crypto'

const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/'
export const TIKTOK_API = 'https://open.tiktokapis.com/v2'
const SCOPES = ['user.info.basic', 'video.upload', 'video.publish']
const TEN_MINUTES = 10 * 60 * 1000

export interface TikTokConfig {
  clientKey: string
  clientSecret: string
  /** The web app's `/connect/tiktok`, as registered on the TikTok app. */
  redirectUrl: string
  /** `TOKEN_ENCRYPTION_KEY`, decoded. */
  masterKey: Buffer
  fetch?: typeof fetch
}

export interface TikTokTokens {
  access: string
  refresh: string
  /** Epoch milliseconds, on the server's clock. */
  expiresAt: number
}

/** The token is dead (`invalid_grant`, or refused): someone must connect again. */
export class TikTokReconnect extends Error {}

/** TikTok refused, with its error code. */
export class TikTokError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
  }
}

// The OAuth endpoints answer `{ error: 'invalid_grant' }`; the content endpoints answer
// `{ error: { code: 'ok' | ..., message } }`.
type ErrorBody = { error?: string | { code: string; message: string }; error_description?: string }

function errorOf(body: ErrorBody): { code: string; message: string } | null {
  if (!body.error) return null
  if (typeof body.error === 'string') {
    return { code: body.error, message: body.error_description ?? body.error }
  }
  return body.error.code === 'ok' ? null : body.error
}

interface TokenResponse {
  open_id: string
  access_token: string
  expires_in: number
  refresh_token: string
}

/**
 * TikTok Login Kit for web and the Content Posting API. The access token lasts 24 hours; the
 * refresh token lasts 365 days and may rotate on each refresh, so the new one replaces the old.
 */
export function tiktokApp(config: TikTokConfig) {
  const doFetch = config.fetch ?? fetch
  const state = expiringSealer<{ userId: string; brandId: string }>(
    config.masterKey,
    'tiktok-state',
    TEN_MINUTES,
  )
  const tokens = tokenSealer<TikTokTokens>(config.masterKey, 'tiktok-tokens')

  async function oauth(path: string, params: Record<string, string>) {
    const res = await doFetch(`${TIKTOK_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        ...params,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as TokenResponse & ErrorBody
    const error = errorOf(body)
    if (error?.code === 'invalid_grant') throw new TikTokReconnect(error.message)
    if (error || !res.ok) {
      throw new TikTokError(error?.message ?? `HTTP ${res.status}`, error?.code ?? 'http')
    }
    return body
  }

  /** A content call with the account's token; `body` is sent as JSON. */
  async function api<T>(access: string, path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${TIKTOK_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body ?? {}),
      // A minute at most: a job's whole time on the platform is bounded (`JOB_BUDGET_MS`).
      signal: AbortSignal.timeout(60_000),
    })
    const json = (await res.json().catch(() => ({}))) as { data?: T } & ErrorBody
    const error = errorOf(json)
    if (error?.code === 'access_token_invalid' || res.status === 401) {
      throw new TikTokReconnect(error?.message ?? 'TikTok refused the token')
    }
    if (error || !res.ok) {
      throw new TikTokError(error?.message ?? `HTTP ${res.status}`, error?.code ?? 'http')
    }
    return json.data as T
  }

  const toTokens = (body: TokenResponse, now: number): TikTokTokens => ({
    access: body.access_token,
    refresh: body.refresh_token,
    expiresAt: now + body.expires_in * 1000,
  })

  return {
    api,
    fetch: doFetch,
    sealState: state.seal,
    openState: state.open,
    sealTokens: tokens.seal,
    openTokens: tokens.open,

    authorizeUrl(sealedState: string) {
      const params = new URLSearchParams({
        client_key: config.clientKey,
        response_type: 'code',
        scope: SCOPES.join(','),
        redirect_uri: config.redirectUrl,
        state: sealedState,
      })
      return `${AUTHORIZE}?${params}`
    },

    /** The code from the redirect, for the tokens and the account they belong to. */
    async exchange(code: string, now: number) {
      const body = await oauth('/oauth/token/', {
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUrl,
      })
      const res = await doFetch(`${TIKTOK_API}/user/info/?fields=open_id,display_name`, {
        headers: { Authorization: `Bearer ${body.access_token}` },
      })
      const info = (await res.json().catch(() => ({}))) as ErrorBody & {
        data?: { user?: { display_name?: string } }
      }
      const error = errorOf(info)
      if (error || !res.ok) {
        throw new TikTokError(error?.message ?? `HTTP ${res.status}`, error?.code ?? 'http')
      }
      return {
        accountId: body.open_id,
        username: info.data?.user?.display_name || body.open_id,
        tokens: toTokens(body, now),
      }
    },

    async refresh(current: TikTokTokens, now: number) {
      const body = await oauth('/oauth/token/', {
        grant_type: 'refresh_token',
        refresh_token: current.refresh,
      })
      return toTokens(body, now)
    },

    async revoke(access: string) {
      await oauth('/oauth/revoke/', { token: access })
    },
  }
}

export type TikTokApp = ReturnType<typeof tiktokApp>
