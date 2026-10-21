import { describe, expect, it } from 'vitest'
import { brandAccounts } from '../db/schema'
import { metaApp } from '../meta'
import { tiktokApp } from '../tiktok'
import { NOW, testApp } from '../test-helpers'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

/**
 * A stand-in for the Graph API: the code names the person (`code-ann` signs in as Ann), who
 * manages Pages; Ann's second Page has no Instagram account. Any other request fails the test.
 */
function fakeMeta() {
  const calls: string[] = []
  const PAGES: Record<string, unknown[]> = {
    ann: [
      {
        id: 'page-1',
        name: 'Casa Vostra',
        access_token: 'PAGE-TOKEN-1',
        instagram_business_account: { id: 'ig-1', username: 'casavostra' },
      },
      { id: 'page-2', name: 'Casa Vostra Events', access_token: 'PAGE-TOKEN-2' },
    ],
    bob: [],
  }
  const fetch = async (input: string | URL | Request) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    const p = url.searchParams
    if (url.pathname.endsWith('/oauth/access_token')) {
      if (p.get('code')) return json({ access_token: `short:${p.get('code')!.slice(5)}` })
      return json({ access_token: `long:${p.get('fb_exchange_token')!.slice(6)}` })
    }
    if (url.pathname.endsWith('/me/accounts')) {
      return json({ data: PAGES[p.get('access_token')!.slice(5)] ?? [] })
    }
    throw new Error(`unexpected request ${url}`)
  }
  const app = metaApp({
    appId: 'meta-app',
    appSecret: 'meta-secret',
    configId: 'config-1',
    redirectUrl: 'https://brandbase.test/connect/meta',
    masterKey: Buffer.alloc(32, 9),
    fetch: fetch as typeof globalThis.fetch,
  })
  return { app, calls }
}

/** A stand-in for TikTok: the code names the account (`code-cv` is open_id `cv`). */
function fakeTikTok() {
  const calls: string[] = []
  let revokeFails = false
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input).replace('https://open.tiktokapis.com/v2', '')
    calls.push(url)
    if (url === '/oauth/token/') {
      const code = new URLSearchParams(String(init?.body)).get('code')!
      return json({
        open_id: code.slice(5),
        access_token: `access:${code.slice(5)}`,
        expires_in: 86400,
        refresh_token: `refresh:${code.slice(5)}`,
        refresh_expires_in: 31536000,
        scope: 'user.info.basic,video.upload,video.publish',
      })
    }
    if (url.startsWith('/user/info/')) {
      return json({ data: { user: { display_name: 'Casa Vostra' } }, error: { code: 'ok' } })
    }
    if (url === '/oauth/revoke/')
      return revokeFails ? json({ error: 'server_error' }, 500) : json({})
    throw new Error(`unexpected request ${url}`)
  }
  const app = tiktokApp({
    clientKey: 'tt-key',
    clientSecret: 'tt-secret',
    redirectUrl: 'https://brandbase.test/connect/tiktok',
    masterKey: Buffer.alloc(32, 9),
    fetch: fetch as typeof globalThis.fetch,
  })
  return { app, calls, failRevoke: () => (revokeFails = true) }
}

async function setUp() {
  const meta = fakeMeta()
  const tiktok = fakeTikTok()
  const t = await testApp(NOW, { meta: meta.app, tiktok: tiktok.app })
  return { ...t, meta, tiktok }
}

type T = Awaited<ReturnType<typeof setUp>>

async function start(t: T, platform: 'meta' | 'tiktok', brand: string, token = 'member') {
  const res = await t.call('POST', `/brands/${brand}/${platform}/connect`, {}, token)
  return { url: new URL(res.data.url), state: new URL(res.data.url).searchParams.get('state')! }
}

/** The publishing statuses as the app reads them, from the brand's state. */
const status = async (t: T, brandId: string) =>
  Object.fromEntries(
    (
      (await t.call('GET', `/brands/${brandId}/state`, undefined, 'admin')).data.connections as {
        key: string
        status: string
      }[]
    ).map((c) => [c.key, c.status]),
  )

describe('linking Meta', () => {
  it("offers the person's Pages without their tokens, and keeps the one picked for the brand", async () => {
    const t = await setUp()
    const { url, state } = await start(t, 'meta', 'casa')
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v26.0/dialog/oauth')
    expect(url.searchParams.get('config_id')).toBe('config-1')
    expect(url.searchParams.get('redirect_uri')).toBe('https://brandbase.test/connect/meta')
    // The permissions live in the configuration, so the dialog asks for no scope.
    expect(url.searchParams.has('scope')).toBe(false)

    const back = await t.call('POST', '/meta/callback', { code: 'code-ann', state })
    expect(back.status).toBe(200)
    expect(back.data.pages).toEqual([
      { id: 'page-1', name: 'Casa Vostra', igUsername: 'casavostra' },
      { id: 'page-2', name: 'Casa Vostra Events', igUsername: null },
    ])
    // No Page token reaches the browser in plain text; the choice carries them sealed.
    expect(JSON.stringify(back.data)).not.toContain('PAGE-TOKEN')

    const kept = await t.call('POST', '/meta/select', {
      choice: back.data.choice,
      pageId: 'page-1',
    })
    expect(kept.data).toEqual({ brandId: 'casa', page: 'Casa Vostra', igUsername: 'casavostra' })
    const [row] = await t.db.select().from(brandAccounts)
    expect(row).toMatchObject({
      brandId: 'casa',
      platform: 'meta',
      accountId: 'page-1',
      details: { igUserId: 'ig-1', igUsername: 'casavostra' },
    })
    expect(row!.tokens).not.toContain('PAGE-TOKEN')
    expect(t.meta.app.openTokens(row!.tokens, 'meta:casa:page-1')).toEqual({
      pageToken: 'PAGE-TOKEN-1',
    })
    expect(await status(t, 'casa')).toMatchObject({ fb: 'connected', ig: 'connected' })

    // The state names the accounts for the Connections page; never a token.
    const brandState = await t.call('GET', '/brands/casa/state')
    expect(brandState.data.meta).toEqual({ page: 'Casa Vostra', igUsername: 'casavostra' })
    expect(JSON.stringify(brandState.data)).not.toContain(row!.tokens)
  })

  it('turns Instagram off for a Page with no Instagram account, and says when no Page came back', async () => {
    const t = await setUp()
    const { state } = await start(t, 'meta', 'casa')
    const back = await t.call('POST', '/meta/callback', { code: 'code-ann', state })
    await t.call('POST', '/meta/select', { choice: back.data.choice, pageId: 'page-2' })
    expect(await status(t, 'casa')).toMatchObject({ fb: 'connected', ig: 'off' })

    const again = await start(t, 'meta', 'casa')
    const none = await t.call('POST', '/meta/callback', { code: 'code-bob', state: again.state })
    expect(none).toMatchObject({ status: 400, data: { code: 'NO_PAGES' } })
  })

  it("refuses a link or a pick finished by anyone but the person who started, and another brand's Page", async () => {
    const t = await setUp()
    const { state } = await start(t, 'meta', 'casa', 'admin')
    const stolen = await t.call('POST', '/meta/callback', { code: 'code-ann', state })
    expect(stolen).toMatchObject({ status: 400, data: { code: 'BAD_STATE' } })
    expect(t.meta.calls).toEqual([])

    const back = await t.call('POST', '/meta/callback', { code: 'code-ann', state }, 'admin')
    const picked = await t.call('POST', '/meta/select', {
      choice: back.data.choice,
      pageId: 'page-1',
    })
    expect(picked).toMatchObject({ status: 400, data: { code: 'BAD_STATE' } })
    await t.call('POST', '/meta/select', { choice: back.data.choice, pageId: 'page-1' }, 'admin')

    // Temper picks Casa Vostra's Page: refused, and the reply does not name the brand.
    const other = await start(t, 'meta', 'temper', 'admin')
    const back2 = await t.call(
      'POST',
      '/meta/callback',
      { code: 'code-ann', state: other.state },
      'admin',
    )
    const takenPage = await t.call(
      'POST',
      '/meta/select',
      { choice: back2.data.choice, pageId: 'page-1' },
      'admin',
    )
    expect(takenPage).toMatchObject({ status: 409, data: { code: 'ACCOUNT_TAKEN' } })
    expect(takenPage.data.message).not.toMatch(/casa/i)
  })

  it('refuses the second of two brands picking one Page at the same moment', async () => {
    const t = await setUp()
    const choose = async (brand: string) => {
      const { state } = await start(t, 'meta', brand, 'admin')
      const back = await t.call('POST', '/meta/callback', { code: 'code-ann', state }, 'admin')
      return back.data.choice as string
    }
    const [casa, temper] = [await choose('casa'), await choose('temper')]
    // Both pass the check before either writes: the unique index decides, and the loser is told.
    const results = await Promise.all([
      t.call('POST', '/meta/select', { choice: casa, pageId: 'page-1' }, 'admin'),
      t.call('POST', '/meta/select', { choice: temper, pageId: 'page-1' }, 'admin'),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(results.find((r) => r.status === 409)!.data.code).toBe('ACCOUNT_TAKEN')
    expect(await t.db.select().from(brandAccounts)).toHaveLength(1)
  })

  it('forgets the Page on disconnect and turns Instagram and Facebook off', async () => {
    const t = await setUp()
    const { state } = await start(t, 'meta', 'casa')
    const back = await t.call('POST', '/meta/callback', { code: 'code-ann', state })
    await t.call('POST', '/meta/select', { choice: back.data.choice, pageId: 'page-1' })
    expect((await t.call('DELETE', '/brands/casa/meta')).status).toBe(204)
    expect(await t.db.select().from(brandAccounts)).toEqual([])
    expect(await status(t, 'casa')).toMatchObject({ fb: 'off', ig: 'off' })
    expect((await t.call('GET', '/brands/casa/state')).data.meta).toBeNull()
  })
})

describe('linking TikTok', () => {
  it("keeps the brand's account, refuses it for a second brand, and revokes it on disconnect", async () => {
    const t = await setUp()
    const { url, state } = await start(t, 'tiktok', 'casa')
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.upload,video.publish')
    const done = await t.call('POST', '/tiktok/callback', { code: 'code-cv', state })
    expect(done.data).toEqual({ brandId: 'casa', username: 'Casa Vostra' })
    const [row] = await t.db.select().from(brandAccounts)
    expect(row).toMatchObject({ platform: 'tiktok', accountId: 'cv', username: 'Casa Vostra' })
    expect(row!.tokens).not.toContain('access:cv')
    expect(await status(t, 'casa')).toMatchObject({ tt: 'connected' })
    expect((await t.call('GET', '/brands/casa/state')).data.tiktok).toEqual({
      username: 'Casa Vostra',
    })

    const other = await start(t, 'tiktok', 'temper', 'admin')
    const taken = await t.call(
      'POST',
      '/tiktok/callback',
      { code: 'code-cv', state: other.state },
      'admin',
    )
    expect(taken).toMatchObject({ status: 409, data: { code: 'ACCOUNT_TAKEN' } })

    const gone = await t.call('DELETE', '/brands/casa/tiktok')
    expect(gone.data).toEqual({ revoked: true })
    expect(t.tiktok.calls).toContain('/oauth/revoke/')
    expect(await t.db.select().from(brandAccounts)).toEqual([])
    expect(await status(t, 'casa')).toMatchObject({ tt: 'off' })
  })

  it('forgets the account when its tokens no longer open (the key changed)', async () => {
    const t = await setUp()
    const { state } = await start(t, 'tiktok', 'casa')
    await t.call('POST', '/tiktok/callback', { code: 'code-cv', state })
    await t.db.update(brandAccounts).set({ tokens: 'a.b.c' })
    const gone = await t.call('DELETE', '/brands/casa/tiktok')
    expect(gone).toMatchObject({ status: 200, data: { revoked: false } })
    expect(await t.db.select().from(brandAccounts)).toEqual([])
    expect(await status(t, 'casa')).toMatchObject({ tt: 'off' })
  })

  it('forgets the account even when TikTok refuses the revoke', async () => {
    const t = await setUp()
    const { state } = await start(t, 'tiktok', 'casa')
    await t.call('POST', '/tiktok/callback', { code: 'code-cv', state })
    t.tiktok.failRevoke()
    const gone = await t.call('DELETE', '/brands/casa/tiktok')
    expect(gone.data).toEqual({ revoked: false })
    expect(await t.db.select().from(brandAccounts)).toEqual([])
  })
})

describe('the publishing connections', () => {
  it('are never turned on by hand: they follow the linked accounts', async () => {
    const t = await setUp()
    for (const key of ['ig', 'fb', 'tt']) {
      const res = await t.call('PUT', `/brands/casa/connections/${key}`, { status: 'connected' })
      expect(res.status).toBe(400)
    }
  })

  it('answer 503 while a platform app is not set up', async () => {
    const t = await testApp()
    const off = await t.call('POST', '/brands/casa/meta/connect', {})
    expect(off).toMatchObject({ status: 503, data: { code: 'PLATFORM_OFF' } })
    expect((await t.call('POST', '/brands/casa/tiktok/connect', {})).status).toBe(503)
  })
})
