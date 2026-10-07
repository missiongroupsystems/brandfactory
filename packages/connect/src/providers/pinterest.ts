import { type Config } from '../config'
import {
  type Fetch,
  InvalidTokenError,
  type Provider,
  ProviderError,
  type Tokens,
} from '../platforms'

const AUTHORIZE = 'https://www.pinterest.com/oauth/'
const API = 'https://api.pinterest.com/v5'
const SCOPES = ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read']

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  refresh_token_expires_in?: number
  scope: string
}

/**
 * Pinterest API v5. Access tokens last 30 days; the continuous refresh token lasts 60 days and
 * is renewed by each refresh, so a daily refresh job keeps a connection alive indefinitely.
 */
export function pinterestProvider(config: Config['pinterest'], fetch: Fetch): Provider {
  const basic = Buffer.from(`${config.appId}:${config.appSecret}`).toString('base64')

  async function token(params: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    })
    if (!res.ok) {
      // A refresh request has a fixed shape, so a 400 or 401 means the refresh token is dead.
      if (params.grant_type === 'refresh_token' && (res.status === 400 || res.status === 401)) {
        throw new InvalidTokenError(`Pinterest refresh refused: HTTP ${res.status}`)
      }
      throw new ProviderError(`Pinterest token: HTTP ${res.status}`)
    }
    return (await res.json()) as TokenResponse
  }

  const toTokens = (body: TokenResponse, previousRefresh: string | null = null): Tokens => {
    const now = Date.now()
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? previousRefresh,
      expiresAt: now + body.expires_in * 1000,
      refreshExpiresAt: body.refresh_token_expires_in
        ? now + body.refresh_token_expires_in * 1000
        : null,
    }
  }

  return {
    pkce: false,
    choosesAccounts: false,

    authorizeUrl({ state, redirectUri }) {
      const params = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(','),
        state,
      })
      return `${AUTHORIZE}?${params}`
    },

    async exchange({ code, redirectUri }) {
      const body = await token({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      })
      const res = await fetch(`${API}/user_account`, {
        headers: { Authorization: `Bearer ${body.access_token}` },
      })
      if (!res.ok) throw new ProviderError(`Pinterest user_account: HTTP ${res.status}`)
      const user = (await res.json()) as { id: string; username: string }
      return [
        {
          platform: 'pinterest',
          externalAccountId: user.id,
          externalUserId: user.id,
          displayName: user.username,
          igBusinessAccountId: null,
          scopes: body.scope.split(/[\s,]+/).filter(Boolean),
          tokens: toTokens(body),
        },
      ]
    },

    async refresh(tokens) {
      if (!tokens.refreshToken) throw new InvalidTokenError('Pinterest: no refresh token stored')
      const body = await token({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
      return toTokens(body, tokens.refreshToken)
    },

    // No revoke: POST /v5/oauth/token/revoke accepts only system-user tokens (checked 7 Oct 2026).
  }
}
