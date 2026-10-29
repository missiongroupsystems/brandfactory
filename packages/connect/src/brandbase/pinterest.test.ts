import { addPrincipal, setLoadout } from '@brandfactory/core/src/registry'
import { describe, expect, it } from 'vitest'
import { pinterestApp } from './pinterest'
import { NOW, serve } from './test-core'

const DAY = 24 * 60 * 60 * 1000

/**
 * A stand-in for Pinterest with two accounts: the code names the account that signed in
 * (`code-casa` signs in as `acct-casa`), and each account has its own boards. Any request it does
 * not know fails the test, so nothing reaches the network.
 */
function fakePinterest() {
  const calls: string[] = []
  let refreshRefused = false
  let issued = 0
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  const BOARDS: Record<string, { id: string; name: string; pin_count: number }[]> = {
    'acct-casa': [
      { id: '111', name: 'Casa Vostra moodboard', pin_count: 2 },
      { id: '112', name: 'Shoot references', pin_count: 0 },
    ],
    'acct-other': [{ id: '222', name: 'Another moodboard', pin_count: 4 }],
  }

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input).replace('https://api.pinterest.com/v5', '')
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url === '/oauth/token') {
      const params = new URLSearchParams(String(init?.body))
      const refresh = params.get('grant_type') === 'refresh_token'
      if (refresh && refreshRefused) return json({}, 400)
      // The account rides in the token, so each call below knows whose it is.
      const acct = refresh
        ? params.get('refresh_token')!.split(':')[1]
        : params.get('code')!.replace('code-', 'acct-')
      issued++
      return json({
        access_token: `access:${acct}:${issued}`,
        refresh_token: `refresh:${acct}:${issued}`,
        expires_in: 30 * 24 * 60 * 60,
        scope: 'boards:read,pins:read,user_accounts:read',
      })
    }
    const auth = new Headers(init?.headers).get('authorization') ?? ''
    const acct = /^Bearer access:([^:]+):/.exec(auth)?.[1]
    if (!acct) return json({}, 401)
    if (url === '/user_account') return json({ id: acct, username: acct.replace('acct-', '') })
    if (url === '/boards?page_size=250') return json({ items: BOARDS[acct] })
    if (url === '/boards/111' && acct === 'acct-casa') {
      return json({ id: '111', name: 'Casa Vostra moodboard' })
    }
    if (url === '/boards/111/pins?page_size=250' && acct === 'acct-casa') {
      return json({
        items: [
          {
            id: 'p1',
            title: 'Pasta by the window',
            link: 'https://example.com/pasta',
            media: {
              images: {
                '600x': { url: 'https://i.pinimg.com/600x/p1.jpg', width: 600, height: 900 },
              },
            },
          },
          // A pin with no picture shows nothing on a moodboard.
          { id: 'p2', title: 'No picture', media: { images: {} } },
        ],
      })
    }
    throw new Error(`unexpected request ${url}`)
  }

  const app = pinterestApp({
    appId: 'app-id',
    appSecret: 'app-secret',
    redirectUrl: 'https://brandbase.test/connect/pinterest',
    masterKey: Buffer.alloc(32, 7),
    fetch: fetch as typeof globalThis.fetch,
  })
  return { app, calls, refuseRefresh: () => (refreshRefused = true) }
}

type T = Awaited<ReturnType<typeof serve>>

/** Starts a brand's sign-in as `token` and finishes it with the account `code` names. */
async function connect(t: T, brand: string, code: string, token = 'member') {
  const started = await t.call('POST', `/brands/${brand}/pinterest/connect`, {}, token)
  const state = new URL(started.data.url).searchParams.get('state')!
  const done = await t.call('POST', '/pinterest/callback', { code, state }, token)
  return { started, state, done }
}

async function setUp(now = NOW) {
  const pinterest = fakePinterest()
  const t = await serve({ pinterest: pinterest.app }, now)
  return { ...t, pinterest }
}

describe('Pinterest', () => {
  it("links a brand's own account from a member of the brand, and keeps its tokens sealed", async () => {
    const t = await setUp()
    const { started, done } = await connect(t, 'casa', 'code-casa')
    const url = new URL(started.data.url)
    expect(url.origin + url.pathname).toBe('https://www.pinterest.com/oauth/')
    expect(url.searchParams.get('redirect_uri')).toBe('https://brandbase.test/connect/pinterest')
    expect(url.searchParams.get('scope')).toBe('boards:read,pins:read,user_accounts:read')
    expect(done).toMatchObject({ status: 200, data: { brandId: 'casa', username: 'casa' } })

    const [row] = await t.accounts()
    expect(row).toMatchObject({ brand_id: 'casa', account_id: 'acct-casa', connected_by: 'member' })
    expect(row!.tokens).not.toContain('access:')

    const setup = await t.call('GET', '/brands/casa/pinterest')
    expect(setup.data.account).toEqual({ username: 'casa' })
    // The state names the account, so Connections shows it before a board is picked; never the
    // tokens.
    const state = await t.stateOf('casa')
    expect(state.pinterest).toEqual({ username: 'casa' })
    expect(JSON.stringify(state)).not.toContain(row!.tokens)
    expect((await t.stateOf('temper', 'both')).pinterest).toBeNull()
    expect(setup.data.boards.map((b: { id: string }) => b.id)).toEqual(['111', '112'])
    // The other brand has no account of its own yet.
    const other = await t.call('GET', '/brands/temper/pinterest', undefined, 'both')
    expect(other.data).toEqual({ account: null, boards: [] })
  })

  it('gives each brand its own account, and refuses one account for two brands', async () => {
    const t = await setUp()
    await connect(t, 'casa', 'code-casa')
    expect((await connect(t, 'temper', 'code-other', 'both')).done.status).toBe(200)
    // Temper signs in with Casa Vostra's account: refused, and Casa Vostra keeps it.
    const taken = (await connect(t, 'temper', 'code-casa', 'both')).done
    expect(taken).toMatchObject({ status: 409, data: { code: 'ACCOUNT_TAKEN' } })
    expect(taken.data.message).not.toContain('casa')
    const rows = await t.accounts()
    expect(rows.map((r) => [r.brand_id, r.account_id]).sort()).toEqual([
      ['casa', 'acct-casa'],
      ['temper', 'acct-other'],
    ])
    // Each brand sees only its own boards, and cannot pick another account's board.
    const temper = await t.call('GET', '/brands/temper/pinterest', undefined, 'both')
    expect(temper.data.boards.map((b: { id: string }) => b.id)).toEqual(['222'])
    const foreign = await t.call('PUT', '/brands/temper/pinterest', { boardId: '111' }, 'both')
    expect(foreign.status).toBe(404)
  })

  it('refuses the second of two brands finishing with the same account at the same moment', async () => {
    const t = await setUp()
    const start = async (brand: string) => {
      const started = await t.call('POST', `/brands/${brand}/pinterest/connect`, {}, 'both')
      return new URL(started.data.url).searchParams.get('state')!
    }
    const [casa, temper] = [await start('casa'), await start('temper')]
    // Both pass the check before either writes: the unique index decides, and the loser is told.
    const results = await Promise.all([
      t.call('POST', '/pinterest/callback', { code: 'code-casa', state: casa }, 'both'),
      t.call('POST', '/pinterest/callback', { code: 'code-casa', state: temper }, 'both'),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(results.find((r) => r.status === 409)!.data.code).toBe('ACCOUNT_TAKEN')
    expect(await t.accounts()).toHaveLength(1)
  })

  it('refuses a sign-in finished by someone who lost the brand meanwhile', async () => {
    const t = await setUp()
    const started = await t.call('POST', '/brands/casa/pinterest/connect', {})
    const state = new URL(started.data.url).searchParams.get('state')!
    await t.db.query(`delete from brandbase.org_members where user_id = 'member'`)
    const done = await t.call('POST', '/pinterest/callback', { code: 'code-casa', state })
    expect(done.status).toBe(404)
    expect(await t.accounts()).toEqual([])
  })

  it('refuses a connect link finished by anyone but the person who started it', async () => {
    const t = await setUp()
    // A member cannot start a sign-in for a brand they do not reach.
    expect((await t.call('POST', '/brands/temper/pinterest/connect', {})).status).toBe(404)

    const started = await t.call('POST', '/brands/casa/pinterest/connect', {}, 'both')
    const state = new URL(started.data.url).searchParams.get('state')!
    // The member got another person's link: their Pinterest must not land on the brand.
    const stolen = await t.call('POST', '/pinterest/callback', { code: 'code-other', state })
    expect(stolen).toMatchObject({ status: 400, data: { code: 'PINTEREST_STATE' } })
    const forged = await t.call(
      'POST',
      '/pinterest/callback',
      { code: 'code-casa', state: 'x.y.z' },
      'both',
    )
    expect(forged.status).toBe(400)
    expect(await t.accounts()).toEqual([])
    expect(t.pinterest.calls).toEqual([])
  })

  it('refuses a connect link after ten minutes', async () => {
    const t = await setUp()
    const started = await t.call('POST', '/brands/casa/pinterest/connect', {})
    const state = new URL(started.data.url).searchParams.get('state')!
    t.setNow(new Date(NOW.getTime() + 11 * 60 * 1000))
    const late = await t.call('POST', '/pinterest/callback', { code: 'code-casa', state })
    expect(late).toMatchObject({ status: 400, data: { code: 'PINTEREST_STATE' } })
  })

  it("reads the brand's board live, with only the pins that have a picture", async () => {
    const t = await setUp()
    await connect(t, 'casa', 'code-casa')
    expect((await t.call('GET', '/brands/casa/pinterest/pins')).status).toBe(404)
    const put = await t.call('PUT', '/brands/casa/pinterest', { boardId: '111' })
    expect(put.data).toMatchObject({ details: { board: '111' } })
    const setup = await t.call('GET', '/brands/casa/pinterest')
    expect(setup.data.boards.map((b: { picked: boolean }) => b.picked)).toEqual([true, false])
    // The picked board turns the source on, so the app knows it is on after a reload.
    const state = await t.stateOf('casa')
    expect(state.connections).toContainEqual(
      expect.objectContaining({ key: 'pinterest', status: 'connected' }),
    )

    const pins = await t.call('GET', '/brands/casa/pinterest/pins')
    expect(pins.data).toEqual({
      board: { id: '111', name: 'Casa Vostra moodboard' },
      pins: [
        {
          id: 'p1',
          title: 'Pasta by the window',
          link: 'https://example.com/pasta',
          image: 'https://i.pinimg.com/600x/p1.jpg',
          width: 600,
          height: 900,
        },
      ],
    })
    // Read again, Pinterest is asked again: no pin is kept on our side.
    const before = t.pinterest.calls.filter((c) => c.includes('/pins')).length
    await t.call('GET', '/brands/casa/pinterest/pins')
    expect(t.pinterest.calls.filter((c) => c.includes('/pins')).length).toBe(before + 1)
  })

  it('clears the board when the brand signs in with another account, and forgets the account on disconnect', async () => {
    const t = await setUp()
    await connect(t, 'casa', 'code-casa')
    await t.call('PUT', '/brands/casa/pinterest', { boardId: '111' })
    // The same account again (a reconnect): the board stays.
    await connect(t, 'casa', 'code-casa')
    expect((await t.call('GET', '/brands/casa/pinterest/pins')).status).toBe(200)
    // Another account: board 111 is not on it, so the source goes off.
    await connect(t, 'casa', 'code-other')
    expect((await t.call('GET', '/brands/casa/pinterest/pins')).status).toBe(404)
    expect((await t.stateOf('casa')).connections).toContainEqual(
      expect.objectContaining({ key: 'pinterest', status: 'off' }),
    )

    expect((await t.call('DELETE', '/brands/casa/pinterest')).status).toBe(204)
    expect(await t.accounts()).toEqual([])
    expect((await t.call('GET', '/brands/casa/pinterest')).data.account).toBeNull()
    // The account is free for another brand now.
    expect((await connect(t, 'temper', 'code-other', 'both')).done.status).toBe(200)
  })

  it('refreshes a token with under a day left, and asks for a reconnect when the refresh is refused', async () => {
    const t = await setUp()
    await connect(t, 'casa', 'code-casa')
    // 29.5 days on: the 30-day token has half a day left.
    t.setNow(new Date(NOW.getTime() + 29.5 * DAY))
    await t.call('PUT', '/brands/casa/pinterest', { boardId: '111' })
    expect(t.pinterest.calls.filter((c) => c === 'POST /oauth/token')).toHaveLength(2)
    const [after] = await t.accounts()
    expect(t.pinterest.app.openTokens(after!.tokens, 'pinterest:casa:acct-casa')).toMatchObject({
      access: 'access:acct-casa:2',
      refresh: 'refresh:acct-casa:2',
    })
    // The tokens open only in their own brand's row.
    expect(() => t.pinterest.app.openTokens(after!.tokens, 'pinterest:temper:acct-casa')).toThrow()

    // 59.5 days on, the refresh token is gone: the brand must connect again.
    t.pinterest.refuseRefresh()
    t.setNow(new Date(NOW.getTime() + 59.5 * DAY))
    const res = await t.call('GET', '/brands/casa/pinterest')
    expect(res).toMatchObject({ status: 409, data: { code: 'PINTEREST_RECONNECT' } })

    // Tokens that no longer open (the key changed) ask for a new sign-in, not a server error.
    await t.db.query(`update brandbase.accounts set tokens = 'a.b.c'`)
    const unreadable = await t.call('GET', '/brands/casa/pinterest')
    expect(unreadable).toMatchObject({ status: 409, data: { code: 'PINTEREST_RECONNECT' } })
  })

  it('refreshes once when two reads need a fresh token at the same moment', async () => {
    const t = await setUp()
    await connect(t, 'casa', 'code-casa')
    await t.call('PUT', '/brands/casa/pinterest', { boardId: '111' })
    t.setNow(new Date(NOW.getTime() + 29.5 * DAY))
    // The setup's boards and the moodboard's pins, side by side.
    const [boards, pins] = await Promise.all([
      t.call('GET', '/brands/casa/pinterest'),
      t.call('GET', '/brands/casa/pinterest/pins'),
    ])
    expect([boards.status, pins.status]).toEqual([200, 200])
    // The sign-in, then one refresh.
    expect(t.pinterest.calls.filter((c) => c === 'POST /oauth/token')).toHaveLength(2)
  })

  it('answers 503 while the Pinterest app is not set up, and keeps Pinterest off the generic key', async () => {
    const { call } = await serve({})
    const off = await call('GET', '/brands/casa/pinterest')
    expect(off).toMatchObject({ status: 503, data: { code: 'PLATFORM_OFF' } })
    // A brand is never "connected" to Pinterest without a board.
    const generic = await call('POST', '/ops/brandbase/connection.set', {
      brand: 'casa',
      key: 'pinterest',
      status: 'connected',
    })
    expect(generic.status).toBe(400)
  })

  it('tells the web app which platforms it can sign in to, with no sign-in needed', async () => {
    const on = await setUp()
    const res = await on.call('GET', '/platforms', undefined, '')
    expect(res).toMatchObject({ status: 200, data: { pinterest: true } })
    const off = await serve({})
    expect((await off.call('GET', '/platforms')).data).toEqual({
      pinterest: false,
      tiktok: false,
      instagram: false,
      facebook: false,
    })
  })

  it('lets only a person who reaches the brand link it: not an agent, not a screen', async () => {
    const t = await setUp()
    await addPrincipal(t.db, 'member-agent', 'member')
    await setLoadout(t.db, 'member-agent', 'brandbase', ['account.read', 'brand.state'])
    const agent = await t.call('POST', '/brands/casa/pinterest/connect', {}, 'member-agent')
    expect(agent).toMatchObject({ status: 403, data: { code: 'NOT_A_PERSON' } })
    // The account moves are not on the core's door for screens.
    const door = await t.call('POST', '/ops/brandbase/account.read', {
      brand: 'casa',
      platform: 'pinterest',
    })
    expect(door).toMatchObject({ status: 404, data: { code: 'OP_NOT_FOUND' } })
    expect(t.pinterest.calls).toEqual([])
  })
})
