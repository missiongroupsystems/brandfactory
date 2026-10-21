import { deriveKey, openExpiring, seal, sealExpiring, unseal } from './crypto'

const AUTHORIZE = 'https://www.pinterest.com/oauth/'
const API = 'https://api.pinterest.com/v5'
// The secret scopes too: a brand's moodboard is often a secret board.
const SCOPES = [
  'boards:read',
  'boards:read_secret',
  'pins:read',
  'pins:read_secret',
  'user_accounts:read',
]
/** How long a connect link stays good. */
const STATE_TTL_MS = 10 * 60 * 1000

export interface PinterestConfig {
  appId: string
  appSecret: string
  /** The web app's `/connect/pinterest`, as registered on the Pinterest app. */
  redirectUrl: string
  /** `TOKEN_ENCRYPTION_KEY`, decoded. Changing it makes the stored tokens unreadable. */
  masterKey: Buffer
  fetch?: typeof fetch
}

export interface Tokens {
  access: string
  refresh: string | null
  /** Epoch milliseconds, on the server's clock (`deps.now`). */
  expiresAt: number
}

export interface PinterestBoard {
  id: string
  name: string
  pinCount: number
  cover: string | null
}

export interface PinterestPin {
  id: string
  title: string
  link: string | null
  image: string
  width: number
  height: number
}

/** The token is dead: someone must connect the account again. */
export class PinterestReconnect extends Error {}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
}

interface ImageSize {
  url: string
  width: number
  height: number
}

/**
 * Pinterest API v5, for the account each brand links. Access tokens last 30 days; the refresh token
 * lasts 60 days and each refresh renews it.
 */
export function pinterestApp(config: PinterestConfig) {
  const doFetch = config.fetch ?? fetch
  const basic = Buffer.from(`${config.appId}:${config.appSecret}`).toString('base64')
  const stateKey = deriveKey(config.masterKey, 'pinterest-state')
  const tokenKey = deriveKey(config.masterKey, 'pinterest-tokens')

  async function token(
    params: Record<string, string>,
    now: number,
    previousRefresh: string | null = null,
  ) {
    const res = await doFetch(`${API}/oauth/token`, {
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
        throw new PinterestReconnect(`Pinterest refresh refused: HTTP ${res.status}`)
      }
      throw new Error(`Pinterest token: HTTP ${res.status}`)
    }
    const body = (await res.json()) as TokenResponse
    return {
      access: body.access_token,
      refresh: body.refresh_token ?? previousRefresh,
      expiresAt: now + body.expires_in * 1000,
    } satisfies Tokens
  }

  async function get<T>(access: string, path: string): Promise<T> {
    const res = await doFetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access}` } })
    if (res.status === 401) throw new PinterestReconnect('Pinterest refused the token')
    if (!res.ok) throw new Error(`Pinterest ${path.split('?')[0]}: HTTP ${res.status}`)
    return (await res.json()) as T
  }

  return {
    authorizeUrl(state: string) {
      const params = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: config.redirectUrl,
        response_type: 'code',
        scope: SCOPES.join(','),
        state,
      })
      return `${AUTHORIZE}?${params}`
    },

    sealState: (value: { userId: string; brandId: string }, now: number) =>
      sealExpiring(stateKey, 'pinterest-state', value, now + STATE_TTL_MS),
    openState: (sealed: string, now: number) =>
      openExpiring<{ userId: string; brandId: string }>(stateKey, 'pinterest-state', sealed, now),

    /** `bound` names the row (brand and account): the tokens open only there. */
    sealTokens: (tokens: Tokens, bound: string) => seal(tokenKey, JSON.stringify(tokens), bound),
    openTokens: (sealed: string, bound: string) =>
      JSON.parse(unseal(tokenKey, sealed, bound)) as Tokens,

    /** The code from the redirect, for the tokens and the account they belong to. */
    async exchange(code: string, now: number) {
      const tokens = await token(
        { grant_type: 'authorization_code', code, redirect_uri: config.redirectUrl },
        now,
      )
      const user = await get<{ id: string; username: string }>(tokens.access, '/user_account')
      return { accountId: user.id, username: user.username, tokens }
    },

    async refresh(tokens: Tokens, now: number) {
      if (!tokens.refresh) throw new PinterestReconnect('Pinterest: no refresh token stored')
      const params = { grant_type: 'refresh_token', refresh_token: tokens.refresh }
      return token(params, now, tokens.refresh)
    },

    async boards(access: string): Promise<PinterestBoard[]> {
      const body = await get<{
        items: {
          id: string
          name: string
          pin_count?: number
          media?: { image_cover_url?: string | null }
        }[]
      }>(access, '/boards?page_size=250')
      return body.items.map((b) => ({
        id: b.id,
        name: b.name,
        pinCount: b.pin_count ?? 0,
        cover: b.media?.image_cover_url ?? null,
      }))
    },

    /** The board's name and its newest pins (one page of 250). Pins with no picture are left out. */
    async pins(access: string, boardId: string) {
      const id = encodeURIComponent(boardId)
      const [board, body] = await Promise.all([
        get<{ id: string; name: string }>(access, `/boards/${id}`),
        get<{
          items: {
            id: string
            title?: string | null
            description?: string | null
            link?: string | null
            media?: { images?: Record<string, ImageSize> }
          }[]
        }>(access, `/boards/${id}/pins?page_size=250`),
      ])
      const pins = body.items.flatMap((p): PinterestPin[] => {
        const images = p.media?.images ?? {}
        const image = images['600x'] ?? images['1200x'] ?? images['400x300']
        if (!image) return []
        return [
          {
            id: p.id,
            title: p.title || p.description || '',
            link: p.link ?? null,
            image: image.url,
            width: image.width,
            height: image.height,
          },
        ]
      })
      return { board: { id: board.id, name: board.name }, pins }
    },
  }
}

export type PinterestApp = ReturnType<typeof pinterestApp>
