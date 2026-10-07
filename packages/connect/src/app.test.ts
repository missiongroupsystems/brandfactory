import { afterEach, describe, expect, it, vi } from 'vitest'
import { pkceChallenge } from './crypto'
import {
  BASE,
  callback,
  connectTikTok,
  setup,
  startConnect,
  TT_REVOKE,
  TT_TOKEN,
  TT_USER,
  tiktokToken,
  tiktokUser,
} from './test-helpers'

afterEach(() => {
  vi.useRealTimers()
})

describe('connect start', () => {
  it('builds each platform authorize URL with our redirect URI and a sealed state', async () => {
    const { app } = await setup()
    const meta = await startConnect(app, 'casa-vostra', 'meta')
    expect(meta.location.origin + meta.location.pathname).toBe(
      'https://www.facebook.com/v26.0/dialog/oauth',
    )
    expect(meta.location.searchParams.get('config_id')).toBe('meta-config')
    expect(meta.location.searchParams.get('redirect_uri')).toBe(`${BASE}/callback/meta`)

    const pin = await startConnect(app, 'casa-vostra', 'pinterest')
    expect(pin.location.origin + pin.location.pathname).toBe('https://www.pinterest.com/oauth/')
    expect(pin.location.searchParams.get('scope')).toContain('pins:write')

    const tt = await startConnect(app, 'casa-vostra', 'tiktok')
    expect(tt.location.origin + tt.location.pathname).toBe(
      'https://www.tiktok.com/v2/auth/authorize/',
    )
    expect(tt.location.searchParams.get('client_key')).toBe('tt-key')
    // The state is encrypted: the brand id is not readable from the URL.
    expect(tt.state).not.toContain('casa-vostra')
    expect(tt.cookie).toMatch(/^bb_connect_nonce=/)
  })
})

describe('callback state', () => {
  it('rejects a tampered state before any call to the platform', async () => {
    const { app, net } = await setup()
    const { state, cookie } = await startConnect(app, 'casa-vostra', 'tiktok')
    // Flip one bit of the ciphertext (the third part: iv.tag.body).
    const [iv, tag, body] = state.split('.')
    const bytes = Buffer.from(body!, 'base64url')
    bytes[0]! ^= 1
    const tampered = [iv, tag, bytes.toString('base64url')].join('.')
    const res = await callback(app, 'tiktok', { code: 'c', state: tampered }, cookie)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_state' })
    expect(net.calls).toHaveLength(0)
  })

  it('rejects a state older than ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { app, net } = await setup()
    const { state, cookie } = await startConnect(app, 'casa-vostra', 'tiktok')
    vi.setSystemTime(Date.now() + 11 * 60 * 1000)
    const res = await callback(app, 'tiktok', { code: 'c', state }, cookie)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'expired_state' })
    expect(net.calls).toHaveLength(0)
  })

  it("rejects one platform's state on another platform's callback", async () => {
    const { app } = await setup()
    const { state, cookie } = await startConnect(app, 'casa-vostra', 'pinterest')
    const res = await callback(app, 'tiktok', { code: 'c', state }, cookie)
    expect(res.status).toBe(400)
  })

  it('rejects a valid state completed in a browser that did not start the flow', async () => {
    // Otherwise an attacker could send their own connect link and attach the victim's
    // account to the attacker's brand.
    const { app, net } = await setup()
    const { state } = await startConnect(app, 'casa-vostra', 'tiktok')
    const res = await callback(app, 'tiktok', { code: 'c', state }, 'bb_connect_nonce=other')
    expect(res.status).toBe(400)
    expect(net.calls).toHaveLength(0)
  })
})

describe('brand isolation', () => {
  it('a callback for brand A writes only brand A, and brand A cannot read or delete B', async () => {
    const ctx = await setup()
    expect((await connectTikTok(ctx, 'temper', 'open-b')).status).toBe(201)
    expect((await connectTikTok(ctx, 'casa-vostra', 'open-a')).status).toBe(201)

    const [b] = await ctx.store.list('temper')
    expect((await ctx.store.list('temper')).map((c) => c.externalAccountId)).toEqual(['open-b'])
    expect((await ctx.store.list('casa-vostra')).map((c) => c.externalAccountId)).toEqual([
      'open-a',
    ])

    const listed = await ctx.app.request('/brands/casa-vostra/connections')
    expect(JSON.stringify(await listed.json())).not.toContain('open-b')
    expect(await ctx.store.get('casa-vostra', b!.id)).toBeNull()

    const del = await ctx.app.request(`/brands/casa-vostra/connections/${b!.id}`, {
      method: 'DELETE',
    })
    expect(del.status).toBe(404)
    expect(await ctx.store.get('temper', b!.id)).not.toBeNull()
    expect(ctx.net.calls.some((c) => c.key === TT_REVOKE)).toBe(false)
  })

  it('refuses an account another brand owns, and leaves that brand untouched', async () => {
    const ctx = await setup()
    await connectTikTok(ctx, 'temper', 'open-x', 'act.temper-original')
    const res = await connectTikTok(ctx, 'casa-vostra', 'open-x', 'act.casa-attempt')

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('account_taken')
    expect(body.message).not.toContain('temper')
    expect(await ctx.store.list('casa-vostra')).toEqual([])
    const [owned] = await ctx.store.list('temper')
    const stored = await ctx.store.get('temper', owned!.id)
    expect(stored?.tokens.accessToken).toBe('act.temper-original')
  })
})

describe('Meta', () => {
  const GRAPH = 'https://graph.facebook.com/v26.0'
  const pages = [
    {
      id: 'page-1',
      name: 'Casa Vostra',
      access_token: 'page-token-1',
      instagram_business_account: { id: 'ig-1' },
    },
    {
      id: 'page-2',
      name: 'Casa Vostra Events',
      access_token: 'page-token-2',
      instagram_business_account: { id: 'ig-2' },
    },
    { id: 'page-3', name: 'Casa Vostra Deli', access_token: 'page-token-3' },
  ]
  const metaHandlers = {
    [`GET ${GRAPH}/oauth/access_token`]: ({ url }: { url: URL }) => ({
      access_token: url.searchParams.has('fb_exchange_token') ? 'user-long' : 'user-short',
    }),
    [`GET ${GRAPH}/me`]: () => ({
      id: 'fb-user-1',
      permissions: {
        data: [
          { permission: 'instagram_content_publish', status: 'granted' },
          { permission: 'pages_manage_posts', status: 'declined' },
        ],
      },
    }),
    [`GET ${GRAPH}/me/accounts`]: ({ url }: { url: URL }) => {
      // Pages must be read with the long-lived user token, or their tokens expire.
      expect(url.searchParams.get('access_token')).toBe('user-long')
      return { data: pages }
    },
  }

  async function pickPages(ctx: Awaited<ReturnType<typeof setup>>, brand: string, ids: string[]) {
    const { state, cookie } = await startConnect(ctx.app, brand, 'meta')
    const picker = await callback(ctx.app, 'meta', { code: 'c', state }, cookie)
    expect(picker.status).toBe(200)
    const pending = /name="pending" value="([^"]+)"/.exec(await picker.text())?.[1] ?? ''
    const form = new URLSearchParams({ pending })
    for (const id of ids) form.append('account', id)
    return ctx.app.request('/callback/meta/select', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    })
  }

  it('stores one connection per selected Page, with its Page token and IG account id', async () => {
    const ctx = await setup(metaHandlers)
    const res = await pickPages(ctx, 'casa-vostra', ['page-1', 'page-3'])
    expect(res.status).toBe(201)

    // Rows saved in one transaction share created_at, so sort rather than trust list order.
    const saved = (await ctx.store.list('casa-vostra')).sort((a, b) =>
      a.externalAccountId.localeCompare(b.externalAccountId),
    )
    expect(saved.map((c) => [c.externalAccountId, c.igBusinessAccountId])).toEqual([
      ['page-1', 'ig-1'],
      ['page-3', null],
    ])
    expect(saved[0]?.scopes).toEqual(['instagram_content_publish'])
    expect(saved[0]?.externalUserId).toBe('fb-user-1')
    const stored = await ctx.store.get('casa-vostra', saved[0]!.id)
    expect(stored?.tokens).toMatchObject({ accessToken: 'page-token-1', expiresAt: null })
  })

  it('saves no Page at all when one of the selection belongs to another brand', async () => {
    const ctx = await setup(metaHandlers)
    await pickPages(ctx, 'temper', ['page-2'])
    const res = await pickPages(ctx, 'casa-vostra', ['page-1', 'page-2'])
    expect(res.status).toBe(409)
    expect(await ctx.store.list('casa-vostra')).toEqual([])
  })
})

describe('disconnect', () => {
  it('revokes at TikTok while the row still exists, then deletes it', async () => {
    const ctx = await setup()
    await connectTikTok(ctx, 'casa-vostra', 'open-a', 'act.live')
    const [conn] = await ctx.store.list('casa-vostra')
    let rowAtRevoke: unknown = 'not called'
    ctx.net.handlers[TT_REVOKE] = async ({ body }) => {
      expect(body.get('token')).toBe('act.live')
      rowAtRevoke = await ctx.store.get('casa-vostra', conn!.id)
      return {}
    }

    const res = await ctx.app.request(`/brands/casa-vostra/connections/${conn!.id}`, {
      method: 'DELETE',
    })
    expect(await res.json()).toEqual({ deleted: true, revoked: true })
    expect(rowAtRevoke).not.toBeNull()
    expect(rowAtRevoke).not.toBe('not called')
    expect(await ctx.store.list('casa-vostra')).toEqual([])
  })

  it('still deletes when the revoke fails, and says the revoke did not happen', async () => {
    const ctx = await setup()
    await connectTikTok(ctx, 'casa-vostra', 'open-a')
    const [conn] = await ctx.store.list('casa-vostra')
    ctx.net.handlers[TT_REVOKE] = () => Response.json({ error: 'server_error' }, { status: 500 })
    const res = await ctx.app.request(`/brands/casa-vostra/connections/${conn!.id}`, {
      method: 'DELETE',
    })
    expect(await res.json()).toEqual({ deleted: true, revoked: false })
    expect(await ctx.store.list('casa-vostra')).toEqual([])
  })
})

describe('PKCE seam', () => {
  it('sends a challenge and returns the matching verifier when a provider takes PKCE', async () => {
    // No current platform's web flow takes PKCE; YouTube (Google) will.
    const ctx = await setup({
      [TT_TOKEN]: () => tiktokToken('open-a'),
      [TT_USER]: () => tiktokUser('@a'),
    })
    ctx.providers.tiktok.pkce = true
    const { location, state, cookie } = await startConnect(ctx.app, 'casa-vostra', 'tiktok')
    await callback(ctx.app, 'tiktok', { code: 'c', state }, cookie)
    const verifier = ctx.net.calls.find((c) => c.key === TT_TOKEN)?.body.get('code_verifier')
    expect(verifier).toBeTruthy()
    expect(location.searchParams.get('code_challenge')).toBe(pkceChallenge(verifier!))
  })
})
