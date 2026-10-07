import { type Config } from '../config'
import {
  type ConnectedAccount,
  type Fetch,
  InvalidTokenError,
  type Provider,
  ProviderError,
} from '../platforms'

const VERSION = 'v26.0'
const GRAPH = `https://graph.facebook.com/${VERSION}`
const DIALOG = `https://www.facebook.com/${VERSION}/dialog/oauth`

interface GraphError {
  error?: { message: string; code: number }
}

interface Page {
  id: string
  name: string
  access_token?: string
  instagram_business_account?: { id: string }
}

/**
 * Facebook Login for Business. The permissions live in the dashboard configuration that
 * META_CONFIG_ID names, so the dialog takes config_id and no scope.
 */
export function metaProvider(config: Config['meta'], fetch: Fetch): Provider {
  async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
    const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`)
    const body = (await res.json()) as T & GraphError
    if (body.error) {
      // 190 is Meta's "invalid OAuth access token": expired, revoked or the password changed.
      if (body.error.code === 190) throw new InvalidTokenError(`Meta: ${body.error.message}`)
      throw new ProviderError(`Meta ${path}: ${body.error.message}`)
    }
    if (!res.ok) throw new ProviderError(`Meta ${path}: HTTP ${res.status}`)
    return body
  }

  return {
    pkce: false,
    choosesAccounts: true,

    authorizeUrl({ state, redirectUri }) {
      const params = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: redirectUri,
        state,
        config_id: config.configId,
        response_type: 'code',
      })
      return `${DIALOG}?${params}`
    },

    async exchange({ code, redirectUri }) {
      const credentials = { client_id: config.appId, client_secret: config.appSecret }
      const short = await graph<{ access_token: string }>('/oauth/access_token', {
        ...credentials,
        redirect_uri: redirectUri,
        code,
      })
      const long = await graph<{ access_token: string }>('/oauth/access_token', {
        ...credentials,
        grant_type: 'fb_exchange_token',
        fb_exchange_token: short.access_token,
      })
      const me = await graph<{
        id: string
        permissions?: { data: { permission: string; status: string }[] }
      }>('/me', { fields: 'id,permissions', access_token: long.access_token })
      const scopes = (me.permissions?.data ?? [])
        .filter((p) => p.status === 'granted')
        .map((p) => p.permission)

      // A Page token read with a long-lived user token does not expire.
      const pages = await graph<{ data: Page[] }>('/me/accounts', {
        fields: 'id,name,access_token,instagram_business_account{id}',
        limit: '100',
        access_token: long.access_token,
      })
      return pages.data
        .filter((page): page is Page & { access_token: string } => Boolean(page.access_token))
        .map(
          (page): ConnectedAccount => ({
            platform: 'meta',
            externalAccountId: page.id,
            externalUserId: me.id,
            displayName: page.name,
            igBusinessAccountId: page.instagram_business_account?.id ?? null,
            scopes,
            tokens: {
              accessToken: page.access_token,
              refreshToken: null,
              expiresAt: null,
              refreshExpiresAt: null,
            },
          }),
        )
    },

    // Page tokens do not expire, so "refresh" is a health check: a dead token throws
    // InvalidTokenError and the connection is marked needs_reauth.
    async refresh(tokens) {
      await graph('/me', { fields: 'id', access_token: tokens.accessToken })
      return tokens
    },

    // No revoke. Meta can only revoke a person's whole grant (DELETE /{user-id}/permissions),
    // which would also cut every other brand's Page that the same staff member connected.
  }
}
