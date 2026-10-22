import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  accountEmpty,
  approve,
  loadAll,
  needsPassword,
  noAccess,
  onAccount,
  onUser,
  platformOn,
  saveName,
  sessionEmail,
  setPassword,
  signIn,
  signedIn,
  signOut,
} from './remote'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CORE_URL = 'http://core.test'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://auth.test'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  signOut()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
// A token whose claims carry an email, as Supabase's do.
const claims = Buffer.from(JSON.stringify({ sub: 'u1', email: 'nat@missiongroup.com' })).toString(
  'base64url',
)
const TOKEN = `h.${claims}.s`
// A token with an hour left, so no refresh runs in the test; `user` as Supabase answers it.
const token = (user_metadata: object = {}) =>
  json({
    access_token: TOKEN,
    refresh_token: 'r',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'u1', user_metadata },
  })
const me = () => json({ user: { id: 'u1' }, companies: [], brands: [] })

describe('approve', () => {
  it('puts only a move name in the path: the name came from the model', async () => {
    // Anything else could point the yes at another route on the core.
    for (const bad of ['../ops/brandbase/post.schedule', 'post.schedule?x=1', 'Post.Schedule', ''])
      await expect(approve(bad, {})).rejects.toMatchObject({ code: 'BAD_MOVE' })
    expect(fetch).not.toHaveBeenCalled()
    await approve('post.create_draft', { id: 'p1' })
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
      'http://core.test/approve/brandbase/post.create_draft',
    )
  })
})

describe('loadAll', () => {
  it('reads a core on brandbase 1.4.0, whose /me has no companies, as managing none', async () => {
    // The site may meet that core while 1.5.0 is being applied: it must load, with no Add brand.
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith('/me')
        ? new Response(JSON.stringify({ user: { id: 'u' }, brands: [] }), { status: 200 })
        : new Response('[]', { status: 200 }),
    )
    await expect(loadAll()).resolves.toEqual([])
    let companies: unknown = null
    onAccount((a) => (companies = a.companies))()
    expect(companies).toEqual([])
    // No brand and no company: the app shows the waiting page, not the demo's brand.
    expect(accountEmpty()).toBe(true)
  })

  it('does not read one brand refused as the account refused: no "Not in a company yet"', async () => {
    // The brand went (or is walled off) between the list and its state.
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith('/account.me')
        ? json({ user: { id: 'u' }, companies: [{ id: 'c' }], brands: [] })
        : String(url).endsWith('/brand.list')
          ? json([{ id: 'gone' }])
          : json({ code: 'NOT_FOUND', message: 'no such brand' }, 404),
    )
    const err: unknown = await loadAll().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(noAccess(err)).toBe(false)
  })
})

describe('the platforms the server can sign in to', () => {
  const answering = (platforms: Response) =>
    vi
      .mocked(fetch)
      .mockImplementation(async (url) =>
        String(url).endsWith('/platforms')
          ? platforms
          : String(url).endsWith('/account.me')
            ? json({ user: { id: 'u' }, companies: [], brands: [] })
            : json([]),
      )

  it('offers Pinterest only when the server says its app is set up', async () => {
    answering(json({ pinterest: true }))
    await loadAll()
    expect(platformOn('pinterest')).toBe(true)
    expect(platformOn('ig')).toBe(false)
    answering(json({ pinterest: false }))
    await loadAll()
    expect(platformOn('pinterest')).toBe(false)
  })

  it('reads a core with no host beside it (no such route) as signing in to none', async () => {
    answering(json({ pinterest: true }))
    await loadAll()
    answering(json({ code: 'NOT_FOUND', message: 'Not Found' }, 404))
    await expect(loadAll()).resolves.toEqual([])
    expect(platformOn('pinterest')).toBe(false)
  })

  it('still loads the app when the platforms cannot be read, offering none', async () => {
    answering(json({ pinterest: true }))
    await loadAll()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    answering(json({ code: 'ERROR', message: 'bad gateway' }, 502))
    await expect(loadAll()).resolves.toEqual([])
    expect(platformOn('pinterest')).toBe(false)
  })
})

describe('signIn', () => {
  it('reads an account an admin made in the dashboard as one that must set its password', async () => {
    // The dashboard sets no metadata; the mark comes only from the person's own password.
    vi.mocked(fetch).mockResolvedValueOnce(token()).mockResolvedValueOnce(me())
    await signIn('nat@missiongroup.com', 'pw')
    expect(needsPassword()).toBe(true)
    expect(sessionEmail()).toBe('nat@missiongroup.com')
  })

  it('does not ask again once the mark is on the account', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(token({ password_set: true }))
      .mockResolvedValueOnce(me())
    await signIn('nat@missiongroup.com', 'pw')
    expect(needsPassword()).toBe(false)
  })

  it('reads the mark again from a refreshed token, so a session cannot outlive the question', async () => {
    // The first token has the mark but is over; the refresh answers a user without it.
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({
          access_token: TOKEN,
          refresh_token: 'r',
          expires_at: Math.floor(Date.now() / 1000) - 10,
          user: { id: 'u1', user_metadata: { password_set: true } },
        }),
      )
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(me())
    await signIn('nat@missiongroup.com', 'pw')
    expect(String(vi.mocked(fetch).mock.calls[1]![0])).toContain('grant_type=refresh_token')
    expect(needsPassword()).toBe(true)
  })

  it('keeps the session when the core has no place for the account yet: an admin adds them', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        json({ code: 'NO_ACCOUNT', message: 'this account has no access' }, 403),
      )
    await expect(signIn('nat@missiongroup.com', 'pw')).resolves.toBeUndefined()
    expect(signedIn()).toBe(true)
  })

  it('drops the session on a 403 that is not the core refusing the account (a proxy, a WAF)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response('<html>forbidden</html>', { status: 403 }))
    await expect(signIn('nat@missiongroup.com', 'pw')).rejects.toMatchObject({ status: 403 })
    expect(signedIn()).toBe(false)
  })

  it('drops the session when the core fails for any other reason', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json({ code: 'DOWN', message: 'no database' }, 500))
    await expect(signIn('nat@missiongroup.com', 'pw')).rejects.toMatchObject({ status: 500 })
    expect(signedIn()).toBe(false)
  })
})

describe('setPassword', () => {
  beforeEach(async () => {
    vi.mocked(fetch).mockResolvedValueOnce(token()).mockResolvedValueOnce(me())
    await signIn('nat@missiongroup.com', 'pw')
    vi.mocked(fetch).mockClear()
  })

  it('sets the password with the mark, as the signed-in person, and is not asked again', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ id: 'u1' }))
    await setPassword('eight-ch')
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toBe('http://auth.test/auth/v1/user')
    expect(init?.method).toBe('PUT')
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(String(init?.body))).toEqual({
      password: 'eight-ch',
      data: { password_set: true },
    })
    expect(needsPassword()).toBe(false)
    expect(signedIn()).toBe(true)
  })

  it('asks for a fresh sign-in when the session is gone, instead of sending with no bearer', async () => {
    signOut()
    await expect(setPassword('eight-ch')).rejects.toMatchObject({ code: 'SIGN_IN' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("carries Supabase's own error code, so the form can answer it, and still asks", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ code: 422, error_code: 'same_password', msg: 'New password should differ.' }, 422),
    )
    await expect(setPassword('pw')).rejects.toMatchObject({ status: 422, code: 'same_password' })
    expect(needsPassword()).toBe(true)
  })
})

describe("the signed-in person's name", () => {
  // Signs in with a token whose claims carry this Supabase name, then loads a core whose users
  // table names the person "Natalie Ng".
  async function load(supabaseName?: string) {
    const named = Buffer.from(
      JSON.stringify({
        sub: 'u1',
        email: 'nat@missiongroup.com',
        user_metadata: supabaseName ? { name: supabaseName } : {},
      }),
    ).toString('base64url')
    vi.mocked(fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/auth/v1/token'))
        return json({
          access_token: `h.${named}.s`,
          refresh_token: 'r',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'u1', user_metadata: { password_set: true } },
        })
      if (u.endsWith('/account.me'))
        return json({
          user: { id: 'u1', name: 'Natalie Ng', email: 'nat@missiongroup.com' },
          companies: [],
          brands: [],
        })
      return json([])
    })
    await signIn('nat@missiongroup.com', 'pw')
    await loadAll()
    let user: unknown = null
    onAccount((a) => (user = a.user))()
    return user
  }

  it('is the one the person saved on their profile first', async () => {
    expect(await load('Priya Sharma')).toEqual({
      name: 'Priya Sharma',
      email: 'nat@missiongroup.com',
    })
  })

  it("is the core's, as an admin set it, until the person saves their own", async () => {
    expect(await load()).toEqual({ name: 'Natalie Ng', email: 'nat@missiongroup.com' })
  })

  it('saves on the Supabase account as the person, only the name, and shows at once', async () => {
    await load()
    // A brand made since the load lives in the store only: a saved name must not put back the
    // brands as last loaded.
    const brands = vi.fn()
    const off = onAccount(brands)
    brands.mockClear()
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValueOnce(json({ id: 'u1' }))
    await saveName('Nat Ng')
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toBe('http://auth.test/auth/v1/user')
    expect(init?.method).toBe('PUT')
    expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer h\./)
    // Only `name`: Supabase merges it into user_metadata, so `password_set` stays.
    expect(JSON.parse(String(init?.body))).toEqual({ data: { name: 'Nat Ng' } })
    let name = ''
    onUser((u) => (name = u.name))()
    expect(name).toBe('Nat Ng')
    expect(brands).not.toHaveBeenCalled()
    off()
  })
})
