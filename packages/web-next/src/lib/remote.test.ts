import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  accountEmpty,
  approve,
  loadAll,
  onAccount,
  keepSession,
  readLink,
  sessionEmail,
  signIn,
  signedIn,
  signOut,
  signUp,
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
})

describe('signUp', () => {
  it('asks Supabase for an account with the name, and a confirm link back to /sign-up/done', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ id: 'u1', identities: [{ id: 'i1' }] }))
    await expect(signUp('Nat', 'nat@missiongroup.com', 'eight-ch')).resolves.toBe('mail')
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toBe(
      `http://auth.test/auth/v1/signup?redirect_to=${encodeURIComponent('http://localhost:3000/sign-up/done')}`,
    )
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'nat@missiongroup.com',
      password: 'eight-ch',
      data: { name: 'Nat' },
    })
    expect(signedIn()).toBe(false)
  })

  it("reads Supabase's user with no identities as an email that has an account", async () => {
    // Supabase answers 200 for an email that exists, so an outsider cannot list accounts.
    vi.mocked(fetch).mockResolvedValue(json({ id: 'u1', identities: [] }))
    await expect(signUp('Nat', 'nat@missiongroup.com', 'eight-ch')).rejects.toMatchObject({
      code: 'user_already_exists',
    })
  })

  it("carries Supabase's own error code, so the form can answer it", async () => {
    vi.mocked(fetch).mockResolvedValue(
      json({ code: 422, error_code: 'weak_password', msg: 'Password should be…' }, 422),
    )
    await expect(signUp('Nat', 'nat@missiongroup.com', 'eight-ch')).rejects.toMatchObject({
      status: 422,
      code: 'weak_password',
    })
  })

  it('keeps the session a project with no confirm step answers with', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ access_token: TOKEN, refresh_token: 'r' }))
    await expect(signUp('Nat', 'nat@missiongroup.com', 'eight-ch')).resolves.toBe('in')
    expect(sessionEmail()).toBe('nat@missiongroup.com')
  })
})

describe('readLink', () => {
  it('reads the session the confirm link carries; kept, it names the email', () => {
    const link = readLink(`#access_token=${TOKEN}&refresh_token=r&expires_at=1800000000`)
    expect(link).toEqual({ session: { access: TOKEN, refresh: 'r', expires: 1800000000 } })
    expect(signedIn()).toBe(false)
    if ('session' in link) keepSession(link.session)
    expect(signedIn()).toBe(true)
    expect(sessionEmail()).toBe('nat@missiongroup.com')
  })

  it('says a link has expired', () => {
    expect(readLink('#error=access_denied&error_code=otp_expired')).toEqual({
      trouble: 'This link has expired.',
    })
  })
})

describe('signIn', () => {
  // A token with an hour left, so no refresh runs in the test.
  const token = () => json({ access_token: TOKEN, refresh_token: 'r', expires_in: 3600 })

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
