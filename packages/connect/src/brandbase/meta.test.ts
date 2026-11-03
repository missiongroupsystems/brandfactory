import { describe, expect, it } from 'vitest'
import { platformsFromEnv } from './env'
import { metaApp } from './meta'
import { NOW, serve } from './test-core'

const MASTER = Buffer.alloc(32, 7)

/**
 * A stand-in for the Graph API. The code names the person's Pages (`code-casa` sees the Casa Page
 * with its Instagram account, and a second Page without one); each call is kept, and any request
 * it does not know fails the test, so nothing reaches the network.
 */
function fakeMeta() {
  const calls: { method: string; path: string; params: URLSearchParams }[] = []
  const state = { subscribeFails: false, pages: 'code-casa' }
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    // Graph reads a POST's form body, and the query of any other call.
    const params = method === 'POST' ? new URLSearchParams(String(init?.body)) : url.searchParams
    const path = url.pathname.replace('/v26.0', '')
    calls.push({ method, path, params })
    if (path === '/oauth/access_token') {
      expect(params.get('client_secret')).toBe('app-secret')
      if (params.get('grant_type') === 'fb_exchange_token') {
        return json({ access_token: `long:${params.get('fb_exchange_token')}` })
      }
      if (params.get('code') === 'code-bad') {
        return json({ error: { message: 'Invalid verification code', code: 100 } }, 400)
      }
      expect(params.get('redirect_uri')).toBe('https://brandbase.test/connect/meta')
      return json({ access_token: `user:${params.get('code')}` })
    }
    if (path === '/me/accounts') {
      const owner = params.get('access_token')!.replace('long:user:', '')
      if (owner === 'code-none') return json({ data: [] })
      return json({
        data: [
          {
            id: '100001',
            name: 'Casa Vostra',
            access_token: `page:100001:${owner}`,
            instagram_business_account: { id: '17841400000000001', username: 'casavostra' },
          },
          { id: '100002', name: 'Casa Events', access_token: `page:100002:${owner}` },
        ],
      })
    }
    if (/^\/\d+\/subscribed_apps$/.test(path)) {
      if (state.subscribeFails && method === 'POST') {
        return json({ error: { message: '(#200) needs pages_manage_metadata', code: 200 } }, 403)
      }
      return json({ success: true })
    }
    throw new Error(`unexpected request ${method} ${url}`)
  }

  const app = metaApp({
    appId: 'app-id',
    appSecret: 'app-secret',
    configId: 'config-1',
    redirectUrl: 'https://brandbase.test/connect/meta',
    masterKey: MASTER,
    fetch: fetch as typeof globalThis.fetch,
  })
  return { app, calls, state }
}

type T = Awaited<ReturnType<typeof setUp>>

async function setUp() {
  const meta = fakeMeta()
  const t = await serve({ meta: meta.app })
  return { ...t, meta }
}

/** Starts casa's sign-in as `token` and finishes it with `code`: the Pages it answers with. */
async function signIn(t: T, code = 'code-casa', token = 'owner', brand = 'casa') {
  const started = await t.call('POST', `/brands/${brand}/meta/connect`, {}, token)
  const state = new URL(started.data.url).searchParams.get('state')!
  const done = await t.call('POST', '/meta/callback', { code, state }, token)
  return { started, done }
}

describe('Meta: connecting a brand’s Page and Instagram account', () => {
  it('opens Facebook Login for Business with the configuration, not a list of scopes', async () => {
    const t = await setUp()
    const { started } = await signIn(t)
    const url = new URL(started.data.url)
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v26.0/dialog/oauth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'app-id',
      config_id: 'config-1',
      response_type: 'code',
      redirect_uri: 'https://brandbase.test/connect/meta',
    })
    expect(url.searchParams.has('scope')).toBe(false)
  })

  it('answers the person’s Pages, with no token in sight, and links the one picked with its Instagram account', async () => {
    const t = await setUp()
    const { done } = await signIn(t)
    expect(done.status).toBe(200)
    expect(done.data.pages).toEqual([
      { id: '100001', name: 'Casa Vostra', igUsername: 'casavostra' },
      { id: '100002', name: 'Casa Events', igUsername: null },
    ])
    expect(JSON.stringify(done.data)).not.toContain('page:100001')
    // The long-lived token reads the Pages, so the Page tokens do not expire.
    const read = t.meta.calls.find((c) => c.path === '/me/accounts')!
    expect(read.params.get('access_token')).toBe('long:user:code-casa')
    expect(read.params.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/)

    const picked = await t.call(
      'POST',
      '/meta/select',
      { choice: done.data.choice, pageId: '100001' },
      'owner',
    )
    expect(picked).toMatchObject({
      status: 200,
      data: { brandId: 'casa', page: 'Casa Vostra', igUsername: 'casavostra', webhooks: true },
    })
    const rows = await t.accounts()
    expect(rows.map((r) => [r.platform, r.account_id, r.username, r.details])).toEqual([
      ['facebook', '100001', 'Casa Vostra', { via: 'meta', igUserId: '17841400000000001' }],
      ['instagram', '17841400000000001', 'casavostra', { via: 'meta', pageId: '100001' }],
    ])
    // Each row's Page token is sealed to that row and opens nowhere else.
    for (const r of rows) {
      expect(r.tokens).not.toContain('page:100001')
      expect(t.meta.app.openToken(r.tokens, `${r.platform}:casa:${r.account_id}`)).toBe(
        'page:100001:code-casa',
      )
      expect(() =>
        t.meta.app.openToken(r.tokens, `${r.platform}:osteria:${r.account_id}`),
      ).toThrow()
    }
    // The Page's webhooks are on, for the fields the app's settings take.
    const sub = t.meta.calls.find(
      (c) => c.method === 'POST' && c.path === '/100001/subscribed_apps',
    )!
    expect(sub.params.get('subscribed_fields')).toBe('messages,feed')
    // Both accounts are connected for posting.
    const state = await t.stateOf('casa', 'owner')
    expect(state.connections.filter((k: { key: string }) => ['ig', 'fb'].includes(k.key))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ig', status: 'connected' }),
        expect.objectContaining({ key: 'fb', status: 'connected' }),
      ]),
    )
    expect(state.facebook).toMatchObject({ name: 'Casa Vostra', via: 'meta' })
    expect(state.instagram).toMatchObject({ name: 'casavostra', via: 'meta' })
  })

  it('links a Page without Instagram, and drops the Instagram account of the Page linked before', async () => {
    const t = await setUp()
    const first = await signIn(t)
    await t.call(
      'POST',
      '/meta/select',
      { choice: first.done.data.choice, pageId: '100001' },
      'owner',
    )
    const second = await signIn(t)
    const picked = await t.call(
      'POST',
      '/meta/select',
      { choice: second.done.data.choice, pageId: '100002' },
      'owner',
    )
    expect(picked.data).toMatchObject({ page: 'Casa Events', igUsername: null })
    expect((await t.accounts()).map((r) => [r.platform, r.account_id])).toEqual([
      ['facebook', '100002'],
    ])
    // The Page linked before stops sending its webhooks here.
    const off = t.meta.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)
    expect(off).toEqual(['/100001/subscribed_apps'])
  })

  it('keeps the link when the Page’s webhooks do not turn on, and says so', async () => {
    const t = await setUp()
    t.meta.state.subscribeFails = true
    const { done } = await signIn(t)
    const picked = await t.call(
      'POST',
      '/meta/select',
      { choice: done.data.choice, pageId: '100001' },
      'owner',
    )
    expect(picked).toMatchObject({ status: 200, data: { webhooks: false } })
    expect(await t.accounts()).toHaveLength(2)
  })

  it('lets only an owner or admin of a company on the operator’s list start the sign-in, before Facebook’s dialog', async () => {
    const t = await setUp()
    // A member of the brand's company.
    expect(await t.call('POST', '/brands/casa/meta/connect', {}, 'member')).toMatchObject({
      status: 403,
      data: { code: 'FORBIDDEN' },
    })
    // Company B is not on the list: its admin cannot either.
    expect((await t.call('POST', '/brands/temper/meta/connect', {}, 'both')).status).toBe(403)
    expect(t.meta.calls).toEqual([])
    expect(await t.accounts()).toEqual([])
  })

  it('deletes the old Page’s comments and DMs when the brand switches to another Page', async () => {
    const t = await setUp()
    const first = await signIn(t)
    await t.call(
      'POST',
      '/meta/select',
      { choice: first.done.data.choice, pageId: '100001' },
      'owner',
    )
    await t.db.exec(
      `insert into brandbase.inbox_messages (id, brand_id, platform, kind, from_name, from_handle, text, received_at, tone, external)
       values ('meta-old', 'casa', 'fb', 'dm', 'A', '', 'Hi', now(), 'question', '{"sender": "1"}')`,
    )
    const second = await signIn(t)
    await t.call(
      'POST',
      '/meta/select',
      { choice: second.done.data.choice, pageId: '100002' },
      'owner',
    )
    expect(
      await t.db.query(`select id from brandbase.inbox_messages where id = 'meta-old'`),
    ).toEqual([])
  })

  it('refuses a link or a choice finished by anyone but the person who started it', async () => {
    const t = await setUp()
    const started = await t.call('POST', '/brands/casa/meta/connect', {}, 'owner')
    const state = new URL(started.data.url).searchParams.get('state')!
    expect(
      await t.call('POST', '/meta/callback', { code: 'code-casa', state }, 'both'),
    ).toMatchObject({ status: 400, data: { code: 'META_STATE' } })
    const { done } = await signIn(t)
    expect(
      await t.call('POST', '/meta/select', { choice: done.data.choice, pageId: '100001' }, 'both'),
    ).toMatchObject({ status: 400, data: { code: 'META_STATE' } })
    // A Page the sign-in did not offer.
    expect(
      (await t.call('POST', '/meta/select', { choice: done.data.choice, pageId: '9' }, 'owner'))
        .status,
    ).toBe(404)
  })

  it('refuses a choice after ten minutes', async () => {
    const t = await setUp()
    const { done } = await signIn(t)
    t.setNow(new Date(NOW.getTime() + 11 * 60 * 1000))
    expect(
      await t.call('POST', '/meta/select', { choice: done.data.choice, pageId: '100001' }, 'owner'),
    ).toMatchObject({ status: 400, data: { code: 'META_STATE' } })
  })

  it('says so when no Page came back, and keeps Meta’s words when it refuses the code', async () => {
    const t = await setUp()
    expect((await signIn(t, 'code-none')).done).toMatchObject({
      status: 400,
      data: { code: 'META_NO_PAGES' },
    })
    expect((await signIn(t, 'code-bad')).done).toMatchObject({
      status: 502,
      data: { message: 'Facebook: Invalid verification code' },
    })
  })

  it('refuses a Page another brand holds, without naming the brand', async () => {
    const t = await setUp()
    const casa = await signIn(t)
    await t.call(
      'POST',
      '/meta/select',
      { choice: casa.done.data.choice, pageId: '100001' },
      'owner',
    )
    const osteria = await signIn(t, 'code-casa', 'owner', 'osteria')
    const taken = await t.call(
      'POST',
      '/meta/select',
      { choice: osteria.done.data.choice, pageId: '100001' },
      'owner',
    )
    expect(taken).toMatchObject({ status: 409, data: { code: 'ACCOUNT_TAKEN' } })
    expect(JSON.stringify(taken.data)).not.toContain('casa')
  })

  it('lets only an owner or admin disconnect, and a member’s try leaves the Page’s webhooks on', async () => {
    const t = await setUp()
    const { done } = await signIn(t)
    await t.call('POST', '/meta/select', { choice: done.data.choice, pageId: '100001' }, 'owner')
    expect(await t.call('DELETE', '/brands/casa/meta', undefined, 'member')).toMatchObject({
      status: 403,
    })
    expect(t.meta.calls.filter((c) => c.method === 'DELETE')).toEqual([])
    expect(await t.accounts()).toHaveLength(2)
  })

  it('drops the Instagram account of the Page linked before even when the new one is refused', async () => {
    const t = await setUp()
    await t.db.exec(`
      insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by) values
        ('casa', 'instagram', '17841400000000009', 'old', 'sealed', '{"via": "meta", "pageId": "1000"}', 'owner'),
        ('osteria', 'instagram', '17841400000000001', 'osteria', 'make', '{}', 'owner')`)
    const { done } = await signIn(t)
    const picked = await t.call(
      'POST',
      '/meta/select',
      { choice: done.data.choice, pageId: '100001' },
      'owner',
    )
    expect(picked).toMatchObject({ status: 409, data: { code: 'ACCOUNT_TAKEN' } })
    // The Page is casa's; its old Instagram account, with another Page's token, is gone.
    expect((await t.accounts()).map((r) => [r.brand_id, r.platform, r.account_id])).toEqual([
      ['casa', 'facebook', '100001'],
      ['osteria', 'instagram', '17841400000000001'],
    ])
  })

  it('makes an account Make’s again when its id is typed in for Make', async () => {
    const make = { url: 'https://hook.make.test/x', secret: 'k' }
    const meta = fakeMeta()
    const t = await serve({ meta: meta.app, make })
    const started = await t.call('POST', '/brands/casa/meta/connect', {}, 'owner')
    const state = new URL(started.data.url).searchParams.get('state')!
    const done = await t.call('POST', '/meta/callback', { code: 'code-casa', state }, 'owner')
    await t.call('POST', '/meta/select', { choice: done.data.choice, pageId: '100001' }, 'owner')
    await t.call(
      'PUT',
      '/brands/casa/make/facebook',
      { accountId: '100001', name: 'Casa' },
      'owner',
    )
    expect((await t.stateOf('casa', 'owner')).facebook).toMatchObject({ via: 'make' })
  })

  it('turns the Page’s webhooks off and forgets both accounts on disconnect, and leaves a Make link alone', async () => {
    const t = await setUp()
    const { done } = await signIn(t)
    await t.call('POST', '/meta/select', { choice: done.data.choice, pageId: '100001' }, 'owner')
    expect(await t.call('DELETE', '/brands/casa/meta', undefined, 'owner')).toMatchObject({
      status: 200,
      data: { unsubscribed: true },
    })
    const off = t.meta.calls.find((c) => c.method === 'DELETE')!
    expect(off.path).toBe('/100001/subscribed_apps')
    expect(off.params.get('access_token')).toBe('page:100001:code-casa')
    expect(await t.accounts()).toEqual([])

    // An Instagram account typed in for Make is not this route's to forget.
    await t.db.exec(
      `insert into brandbase.accounts (brand_id, platform, account_id, username, tokens, details, connected_by)
       values ('casa', 'instagram', '17841400000000009', 'casa', 'make', '{}', 'owner')`,
    )
    await t.call('DELETE', '/brands/casa/meta', undefined, 'owner')
    expect(await t.accounts()).toHaveLength(1)
  })

  it('says Facebook and Instagram are set up when the Meta app is, and needs all four of its settings', async () => {
    const t = await setUp()
    expect((await t.call('GET', '/platforms')).data).toMatchObject({
      instagram: true,
      facebook: true,
      meta: true,
    })
    const key = MASTER.toString('base64')
    expect(() => platformsFromEnv({ META_APP_ID: 'a', TOKEN_ENCRYPTION_KEY: key })).toThrow(
      /META_CONFIG_ID/,
    )
    expect(() =>
      platformsFromEnv({
        META_APP_ID: 'a',
        META_APP_SECRET: 's',
        META_CONFIG_ID: 'c',
        META_REDIRECT_URL: 'https://brandbase.test/connect/meta',
      }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/)
    const on = platformsFromEnv({
      META_APP_ID: 'a',
      META_APP_SECRET: 's',
      META_CONFIG_ID: 'c',
      META_REDIRECT_URL: 'https://brandbase.test/connect/meta',
      TOKEN_ENCRYPTION_KEY: key,
    })
    expect(on.meta).toBeDefined()
    expect(() =>
      platformsFromEnv({
        META_APP_ID: 'a',
        META_APP_SECRET: 's',
        META_CONFIG_ID: 'c',
        META_REDIRECT_URL: 'http://brandbase.test/connect/meta',
        TOKEN_ENCRYPTION_KEY: key,
      }),
    ).toThrow(/META_REDIRECT_URL: an https address/)
    // The app secret alone, beside the webhook's verify token, is not the sign-in.
    expect(platformsFromEnv({ META_APP_SECRET: 's' }).meta).toBeUndefined()
  })
})
