import { type Config } from '../config'
import {
  type Fetch,
  InvalidTokenError,
  type Provider,
  ProviderError,
  type Tokens,
} from '../platforms'

const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/'
const API = 'https://open.tiktokapis.com/v2'
const SCOPES = ['user.info.basic', 'video.list', 'video.upload']

interface TokenResponse {
  open_id: string
  scope: string
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
}

// The OAuth endpoints answer { error: 'invalid_grant' }; the content endpoints answer
// { error: { code: 'ok' | ..., message } }.
type TikTokError = { error?: string | { code: string; message: string } }

const errorCode = (body: TikTokError): string | null => {
  if (!body.error) return null
  if (typeof body.error === 'string') return body.error
  return body.error.code === 'ok' ? null : body.error.code
}

/**
 * TikTok Login Kit for web. The access token lasts 24 hours; the refresh token lasts 365 days
 * and may rotate on each refresh, so the new one must replace the old.
 */
export function tiktokProvider(config: Config['tiktok'], fetch: Fetch): Provider {
  async function post<T>(path: string, params: Record<string, string>): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        ...params,
      }),
    })
    const text = await res.text()
    const body = (text ? JSON.parse(text) : {}) as T & TikTokError
    const code = errorCode(body)
    if (code === 'invalid_grant') throw new InvalidTokenError(`TikTok ${path}: ${code}`)
    if (code || !res.ok) throw new ProviderError(`TikTok ${path}: ${code ?? `HTTP ${res.status}`}`)
    return body
  }

  const toTokens = (body: TokenResponse): Tokens => {
    const now = Date.now()
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: now + body.expires_in * 1000,
      refreshExpiresAt: now + body.refresh_expires_in * 1000,
    }
  }

  return {
    // TikTok takes code_verifier only from mobile and desktop apps; the web flow has none.
    pkce: false,
    choosesAccounts: false,

    authorizeUrl({ state, redirectUri, codeChallenge }) {
      const params = new URLSearchParams({
        client_key: config.clientKey,
        response_type: 'code',
        scope: SCOPES.join(','),
        redirect_uri: redirectUri,
        state,
      })
      if (codeChallenge) {
        params.set('code_challenge', codeChallenge)
        params.set('code_challenge_method', 'S256')
      }
      return `${AUTHORIZE}?${params}`
    },

    async exchange({ code, redirectUri, codeVerifier }) {
      const body = await post<TokenResponse>('/oauth/token/', {
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      })
      const res = await fetch(`${API}/user/info/?fields=open_id,display_name`, {
        headers: { Authorization: `Bearer ${body.access_token}` },
      })
      const info = (await res.json()) as TikTokError & {
        data?: { user?: { display_name?: string } }
      }
      const infoError = errorCode(info)
      if (infoError || !res.ok) {
        throw new ProviderError(`TikTok user info: ${infoError ?? `HTTP ${res.status}`}`)
      }
      return [
        {
          platform: 'tiktok',
          externalAccountId: body.open_id,
          externalUserId: body.open_id,
          displayName: info.data?.user?.display_name ?? body.open_id,
          igBusinessAccountId: null,
          scopes: body.scope.split(',').filter(Boolean),
          tokens: toTokens(body),
        },
      ]
    },

    async refresh(tokens) {
      if (!tokens.refreshToken) throw new InvalidTokenError('TikTok: no refresh token stored')
      const body = await post<TokenResponse>('/oauth/token/', {
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      })
      return toTokens(body)
    },

    async revoke(tokens) {
      await post('/oauth/revoke/', { token: tokens.accessToken })
    },
  }
}
