import { type Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { html } from 'hono/html'
import { type Config } from './config'
import { disconnect } from './connections'
import {
  deriveKey,
  openExpiring,
  pkceChallenge,
  randomToken,
  SealError,
  sealExpiring,
} from './crypto'
import {
  type ConnectedAccount,
  InvalidTokenError,
  isPlatform,
  type Platform,
  type Providers,
  ProviderError,
} from './platforms'
import { AccountTakenError, type ConnectionStore } from './store'
import { parseMetaSignedRequest, verifyTikTokSignature } from './webhooks'

/**
 * May this request act for this brand? The host app's session answers; this service has none.
 * The returned user id is recorded as connected_by.
 */
export type Authorize = (request: Request, brandId: string) => Promise<{ userId: string } | null>

export interface AppDeps {
  config: Config
  store: ConnectionStore
  providers: Providers
  authorize: Authorize
}

interface OAuthState {
  brandId: string
  platform: Platform
  userId: string
  nonce: string
  codeVerifier?: string
}

interface PendingChoice {
  brandId: string
  platform: Platform
  userId: string
  nonce: string
  accounts: ConnectedAccount[]
}

const NONCE_COOKIE = 'bb_connect_nonce'
const TEN_MINUTES = 10 * 60 * 1000
const DEMO_BRANDS = ['casa-vostra', 'temper', 'carlitos']

export function createApp({ config, store, providers, authorize }: AppDeps) {
  const stateKey = deriveKey(config.encryptionKey, 'oauth-state')
  const redirectUri = (platform: Platform) => `${config.publicBaseUrl}/callback/${platform}`

  /**
   * The state is sealed (encrypted and authenticated), expires in ten minutes, names one
   * platform, and is bound to a nonce cookie set on the browser that started the flow. So a
   * state cannot be edited, replayed late, used on another platform's callback, or completed
   * in someone else's browser to attach their account to the attacker's brand.
   */
  function readState(c: Context, purpose: string, sealed: string | undefined, platform: Platform) {
    const state = openExpiring<OAuthState | PendingChoice>(stateKey, purpose, sealed ?? '')
    if (state.platform !== platform || state.nonce !== getCookie(c, NONCE_COOKIE)) {
      throw new SealError('invalid')
    }
    return state
  }

  async function save(c: Context, brandId: string, userId: string, accounts: ConnectedAccount[]) {
    const connections = await store.save(
      brandId,
      accounts.map((account) => ({ ...account, connectedBy: userId })),
    )
    deleteCookie(c, NONCE_COOKIE, { path: '/' })
    return c.json({ brandId, connections }, 201)
  }

  const app = new Hono()

  app.onError((error, c) => {
    if (error instanceof SealError) {
      const code = error.reason === 'expired' ? 'expired_state' : 'invalid_state'
      return c.json({ error: code, message: error.message }, 400)
    }
    if (error instanceof AccountTakenError) {
      return c.json({ error: 'account_taken', message: error.message }, 409)
    }
    if (error instanceof ProviderError || error instanceof InvalidTokenError) {
      return c.json({ error: 'provider_error', message: error.message }, 502)
    }
    console.error(error)
    return c.json({ error: 'internal_error' }, 500)
  })

  app.get('/', (c) => c.html(testPage()))

  app.get('/brands/:brandId/connect/:platform', async (c) => {
    const { brandId, platform } = c.req.param()
    if (!isPlatform(platform)) return c.json({ error: 'unknown_platform' }, 404)
    const caller = await authorize(c.req.raw, brandId)
    if (!caller) return c.json({ error: 'forbidden' }, 403)

    const provider = providers[platform]
    const nonce = randomToken()
    const codeVerifier = provider.pkce ? randomToken(48) : undefined
    const state: OAuthState = { brandId, platform, userId: caller.userId, nonce, codeVerifier }
    setCookie(c, NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: config.publicBaseUrl.startsWith('https://'),
      // Lax: the platform's redirect back is a top-level GET, which still carries the cookie.
      sameSite: 'Lax',
      path: '/',
      maxAge: TEN_MINUTES / 1000,
    })
    return c.redirect(
      provider.authorizeUrl({
        state: sealExpiring(stateKey, 'oauth-state', state, TEN_MINUTES),
        redirectUri: redirectUri(platform),
        codeChallenge: codeVerifier && pkceChallenge(codeVerifier),
      }),
    )
  })

  app.get('/callback/:platform', async (c) => {
    const platform = c.req.param('platform')
    if (!isPlatform(platform)) return c.json({ error: 'unknown_platform' }, 404)
    const state = readState(c, 'oauth-state', c.req.query('state'), platform) as OAuthState

    const denied = c.req.query('error')
    if (denied) {
      const message = c.req.query('error_description') ?? denied
      return c.json({ error: 'authorization_denied', message }, 400)
    }
    const code = c.req.query('code')
    if (!code) return c.json({ error: 'missing_code' }, 400)

    const provider = providers[platform]
    const accounts = await provider.exchange({
      code,
      redirectUri: redirectUri(platform),
      codeVerifier: state.codeVerifier,
    })
    if (!provider.choosesAccounts) return save(c, state.brandId, state.userId, accounts)

    const pending: PendingChoice = { ...state, platform, accounts }
    return c.html(
      choicePage(
        state.brandId,
        platform,
        accounts,
        sealExpiring(stateKey, 'account-choice', pending, TEN_MINUTES),
      ),
    )
  })

  app.post('/callback/:platform/select', async (c) => {
    const platform = c.req.param('platform')
    if (!isPlatform(platform)) return c.json({ error: 'unknown_platform' }, 404)
    const form = await c.req.parseBody({ all: true })
    const pending = readState(c, 'account-choice', String(form.pending ?? ''), platform)
    const { brandId, userId, accounts } = pending as PendingChoice
    const chosen = [form.account ?? []].flat().map(String)
    const selected = accounts.filter((a) => chosen.includes(a.externalAccountId))
    if (selected.length === 0) return c.json({ error: 'nothing_selected' }, 400)
    return save(c, brandId, userId, selected)
  })

  app.get('/brands/:brandId/connections', async (c) => {
    const brandId = c.req.param('brandId')
    if (!(await authorize(c.req.raw, brandId))) return c.json({ error: 'forbidden' }, 403)
    return c.json({ brandId, connections: await store.list(brandId) })
  })

  app.delete('/brands/:brandId/connections/:id', async (c) => {
    const { brandId, id } = c.req.param()
    if (!(await authorize(c.req.raw, brandId))) return c.json({ error: 'forbidden' }, 403)
    const result = await disconnect(store, providers, brandId, id)
    if (!result) return c.json({ error: 'not_found' }, 404)
    return c.json({ deleted: true, revoked: result.revoked })
  })

  // Meta: the person removed the app. Their Page tokens are dead in every brand.
  app.post('/webhooks/meta/deauthorize', async (c) => {
    const form = await c.req.parseBody()
    const userId = parseMetaSignedRequest(String(form.signed_request ?? ''), config.meta.appSecret)
    if (!userId) return c.json({ error: 'invalid_signature' }, 400)
    await store.markNeedsReauthByExternalUser('meta', userId)
    return c.body(null, 200)
  })

  // Meta: the person asked for their data to be deleted. We hold only connection rows.
  app.post('/webhooks/meta/data-deletion', async (c) => {
    const form = await c.req.parseBody()
    const userId = parseMetaSignedRequest(String(form.signed_request ?? ''), config.meta.appSecret)
    if (!userId) return c.json({ error: 'invalid_signature' }, 400)
    await store.deleteByExternalUser('meta', userId)
    const code = randomToken(12)
    const url = `${config.publicBaseUrl}/meta/deletion-status?code=${code}`
    return c.json({ url, confirmation_code: code })
  })

  // Deletion runs before the callback answers, so every request we confirmed is complete.
  app.get('/meta/deletion-status', (c) =>
    c.text(
      `Request ${c.req.query('code') ?? ''}: complete. brand base deleted every account ` +
        'connection for this Facebook user when Meta sent the request.',
    ),
  )

  // TikTok webhooks. Only authorization.removed is acted on; other events are acknowledged.
  app.post('/webhooks/tiktok', async (c) => {
    const raw = await c.req.text()
    const signature = c.req.header('TikTok-Signature')
    if (!verifyTikTokSignature(signature, raw, config.tiktok.clientSecret)) {
      return c.json({ error: 'invalid_signature' }, 401)
    }
    const event = JSON.parse(raw) as { event?: string; user_openid?: string }
    if (event.event === 'authorization.removed' && event.user_openid) {
      await store.markNeedsReauthByExternalUser('tiktok', event.user_openid)
    }
    return c.body(null, 200)
  })

  return app
}

function choicePage(
  brandId: string,
  platform: Platform,
  accounts: ConnectedAccount[],
  pending: string,
) {
  return html`<!doctype html>
    <meta charset="utf-8" />
    <title>Choose Pages</title>
    <h1>Choose the Pages that belong to ${brandId}</h1>
    <p>Pick only this brand's own Pages. An account can belong to one brand.</p>
    <form method="post" action="/callback/${platform}/select">
      <input type="hidden" name="pending" value="${pending}" />
      ${accounts.length === 0 ? html`<p>This Facebook account manages no Pages.</p>` : ''}
      ${accounts.map(
        (a) =>
          html`<p>
            <label>
              <input type="checkbox" name="account" value="${a.externalAccountId}" />
              ${a.displayName} ${a.igBusinessAccountId ? '(Instagram linked)' : '(no Instagram)'}
            </label>
          </p>`,
      )}
      <button type="submit">Connect</button>
    </form>`
}

function testPage() {
  return html`<!doctype html>
    <meta charset="utf-8" />
    <title>brand base connect</title>
    <h1>brand base connect: test page</h1>
    ${DEMO_BRANDS.map(
      (brand) =>
        html`<p>
          ${brand}: <a href="/brands/${brand}/connect/meta">Meta</a> ·
          <a href="/brands/${brand}/connect/pinterest">Pinterest</a> ·
          <a href="/brands/${brand}/connect/tiktok">TikTok</a> ·
          <a href="/brands/${brand}/connections">connections</a>
        </p>`,
    )}`
}
