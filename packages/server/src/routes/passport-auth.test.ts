import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { __resetRateLimits } from '../passport/rate-limit'
import { challengeFor, createPkce } from '../passport/pkce'
import { createPassportAuthRouter } from './passport-auth'

/**
 * The email-first login, server half.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6a–6b.
 *
 * The router's shape is a **security control**, and the test that pins it matters more
 * than usual: this gets re-litigated about once per product manager, with real UX
 * evidence behind it ("30% of failed logins are a typo'd address and the password field
 * misleads them"), and a passing test is the only thing that survives the argument.
 */

const MEMBER = 'member@acme.test'
const STRANGER = 'stranger@example.test'

function env(over: Partial<Env> = {}): Env {
  return {
    PASSPORT_SSO_ENABLED: true,
    PASSPORT_SUPABASE_URL: 'https://passport.supabase.test',
    PASSPORT_API_URL: 'https://passport-api.test',
    PASSPORT_API_KEY: 'pk',
    PASSPORT_APP_ID: 'app-uuid',
    PASSPORT_DASHBOARD_URL: 'https://passport.test',
    PASSPORT_SSO_CALLBACK_URL: 'https://api.test/auth/passport/callback',
    APP_BASE_URL: 'https://app.test',
    ...over,
  } as Env
}

const membership = {
  role: 'Owner',
  status: 'active',
  organizationId: 'org-1',
  platformUserId: 'p-1',
  email: MEMBER,
  displayName: 'Member',
}

/** Only `MEMBER` is an active member; everything else resolves to nothing. */
function access(over: Record<string, unknown> = {}) {
  return {
    membershipForEmail: vi.fn(async (email: string) =>
      email.toLowerCase() === MEMBER
        ? ({ ok: true, membership } as const)
        : ({ ok: false, reason: 'none' } as const),
    ),
    forPlatformUser: vi.fn(async () => ({
      platformUserId: 'p-1',
      organizationId: 'org-1',
      orgRole: 'Owner',
      rolesByUnit: { 'unit-1': 'Manager' },
      hasAccess: true,
    })),
    forSubject: vi.fn(),
    linkIdentity: vi.fn(async () => 'p-1'),
    organizationsFor: vi.fn(async () => []),
    ...over,
  } as never
}

/** A PKCE store in memory, so the routes need no database. */
function memoryPkce() {
  const rows = new Map<string, { verifier: string; expiresAt: number }>()
  return {
    rows,
    pkce: createPkce({
      create: async ({ state, codeVerifier, expiresAt }) => {
        rows.set(state, { verifier: codeVerifier, expiresAt: expiresAt.getTime() })
      },
      redeem: async (state) => {
        const row = rows.get(state)
        if (!row || row.expiresAt <= Date.now()) return null
        rows.delete(state)
        return row.verifier
      },
    }),
  }
}

function router(
  opts: { env?: Env; access?: never; pkce?: ReturnType<typeof memoryPkce>['pkce'] } = {},
) {
  return createPassportAuthRouter({
    env: opts.env ?? env(),
    access: opts.access ?? access(),
    pkce: opts.pkce ?? memoryPkce().pkce,
    exchange: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
    verifyToken: async () => ({ sub: 'passport-sub', email: MEMBER }),
    hasAnyEntitlement: async () => true,
  })
}

const post = (r: ReturnType<typeof router>, email: unknown) =>
  r.request('/resolve-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })

describe('POST /auth/resolve-login', () => {
  beforeEach(() => {
    __resetRateLimits()
  })

  it('routes an active member to Passport and everyone else app-native', async () => {
    const r = router()
    await expect((await post(r, MEMBER)).json()).resolves.toEqual({ route: 'passport' })
    await expect((await post(r, STRANGER)).json()).resolves.toEqual({ route: 'app-native' })
  })

  // Property 1. A non-member and a nonexistent email must be INDISTINGUISHABLE —
  // `app-native` means "type a password", never "this account exists". A third route
  // is the enumeration oracle, reintroduced by somebody improving an error message.
  it('answers with exactly two routes, and one field', async () => {
    const r = router()
    const bodies = await Promise.all(
      [MEMBER, STRANGER, 'not-an-email', 'nobody@nowhere.test'].map(async (e) =>
        (await post(r, e)).json(),
      ),
    )

    for (const body of bodies) {
      // Adding `exists`, `reason` or `message` here is how the oracle comes back.
      expect(Object.keys(body as object)).toEqual(['route'])
      expect(['passport', 'app-native']).toContain((body as { route: string }).route)
    }
    // A stranger and a malformed address get the SAME answer.
    expect(bodies[1]).toEqual(bodies[2])
    expect(bodies[2]).toEqual(bodies[3])
  })

  // Property 2. Rejecting a malformed address up front would leak "this isn't even a
  // valid email" AHEAD of the routing decision — a different answer for a different
  // class of input is still an oracle.
  it('does not validate the email format before routing', async () => {
    const res = await post(router(), 'not-an-email')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ route: 'app-native' })
  })

  it('caps the length, which is a key-space bound rather than a format check', async () => {
    const res = await post(router(), `${'a'.repeat(400)}@x.test`)
    expect(res.status).toBe(400)
  })

  // Property 6. A structurally two-valued endpoint is still an oracle if one branch
  // hits the database and the other returns early: response timing would partition the
  // input space that the response body refuses to.
  it('does the membership lookup on BOTH branches, and even with SSO off', async () => {
    const a = access()
    const r = createPassportAuthRouter({
      env: env({ PASSPORT_SUPABASE_URL: undefined }),
      access: a,
      pkce: memoryPkce().pkce,
    })

    await post(r, MEMBER)
    await post(r, STRANGER)

    // Same work, both branches — and the SSO-off case still pays for the lookup.
    expect(
      (a as unknown as { membershipForEmail: { mock: { calls: unknown[] } } }).membershipForEmail
        .mock.calls,
    ).toHaveLength(2)
  })

  it('routes everyone app-native when SSO is not configured', async () => {
    const r = createPassportAuthRouter({
      env: env({ PASSPORT_SUPABASE_URL: undefined }),
      access: access(),
      pkce: memoryPkce().pkce,
    })
    await expect((await post(r, MEMBER)).json()).resolves.toEqual({ route: 'app-native' })
  })

  it('routes everyone app-native when the kill switch is off', async () => {
    const r = createPassportAuthRouter({
      env: env({ PASSPORT_SSO_ENABLED: false }),
      access: access(),
      pkce: memoryPkce().pkce,
    })
    // Safe only because the app-native branch always exists.
    await expect((await post(r, MEMBER)).json()).resolves.toEqual({ route: 'app-native' })
  })

  // Property 3. IP alone lets a botnet enumerate one address from many hosts; email
  // alone lets one host sweep a list.
  it('rate-limits by email as well as by IP', async () => {
    const r = router()
    let last = 200
    // The email bucket is the tighter of the two, so it trips first from one IP.
    for (let i = 0; i < 15; i++) {
      last = (
        await r.request('/resolve-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Fly-Client-IP': `10.0.0.${i}` },
          body: JSON.stringify({ email: MEMBER }),
        })
      ).status
    }
    // Varying the IP does not help, because the email bucket is per-address.
    expect(last).toBe(429)
  })

  it('rate-limits by IP across different addresses', async () => {
    const r = router()
    let last = 200
    for (let i = 0; i < 40; i++) {
      last = (
        await r.request('/resolve-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Fly-Client-IP': '10.9.9.9' },
          body: JSON.stringify({ email: `person-${i}@acme.test` }),
        })
      ).status
    }
    expect(last).toBe(429)
  })

  it('rejects a malformed body', async () => {
    const res = await router().request('/resolve-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /auth/passport/start', () => {
  beforeEach(() => {
    __resetRateLimits()
  })

  it('redirects to Passport’s FRONTEND with an unpadded S256 challenge', async () => {
    const store = memoryPkce()
    const res = await router({ pkce: store.pkce }).request('/passport/start')

    expect(res.status).toBe(302)
    const target = new URL(res.headers.get('location')!)

    // The BROWSER target is Passport's frontend — a different host from
    // PASSPORT_API_URL, which is the back channel. Confusing them is the classic
    // hosted-login failure.
    expect(target.origin).toBe('https://passport.test')
    expect(target.pathname).toBe('/authorize')
    expect(target.searchParams.get('client_id')).toBe('app-uuid')
    expect(target.searchParams.get('code_challenge_method')).toBe('S256')

    // The redirect_uri is sent VERBATIM: Passport matches its per-app allow-list
    // exactly, and any normalisation is a chance for the string sent to differ from the
    // string registered.
    expect(target.searchParams.get('redirect_uri')).toBe('https://api.test/auth/passport/callback')

    const state = target.searchParams.get('state')!
    const challenge = target.searchParams.get('code_challenge')!
    // Unpadded base64url is mandatory: a padded challenge is a different string, and
    // the exchange then fails with a flat refusal that says nothing.
    expect(challenge).not.toContain('=')
    expect(challenge).toBe(challengeFor(store.rows.get(state)!.verifier))
  })

  // The verifier is what stops any party who intercepts a code from redeeming it,
  // INCLUDING Passport. A verifier the browser can see protects nothing.
  it('never puts the verifier in the redirect', async () => {
    const store = memoryPkce()
    const res = await router({ pkce: store.pkce }).request('/passport/start')
    const location = res.headers.get('location')!
    const [state] = [...store.rows.keys()]
    expect(location).not.toContain(store.rows.get(state!)!.verifier)
  })

  // Property 4. This route is reached by top-level browser navigation, so a JSON body
  // would render as the entire page.
  it('REDIRECTS rather than returning JSON when Passport is unconfigured', async () => {
    const res = await createPassportAuthRouter({
      env: env({ PASSPORT_SUPABASE_URL: undefined }),
      access: access(),
      pkce: memoryPkce().pkce,
    }).request('/passport/start')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://app.test/login?error=passport_unavailable')
  })

  it('REDIRECTS rather than returning JSON when rate-limited', async () => {
    const r = router()
    let res = await r.request('/passport/start')
    for (let i = 0; i < 40; i++) res = await r.request('/passport/start')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=rate_limited')
  })

  it('REDIRECTS when the attempt cannot be persisted', async () => {
    const res = await createPassportAuthRouter({
      env: env(),
      access: access(),
      pkce: createPkce({
        create: async () => {
          throw new Error('db down')
        },
        redeem: async () => null,
      }),
    }).request('/passport/start')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=passport_unavailable')
  })
})

describe('GET /auth/passport/callback', () => {
  beforeEach(() => {
    __resetRateLimits()
  })

  async function startThen(
    r: ReturnType<typeof router>,
    store: ReturnType<typeof memoryPkce>,
    query: (state: string) => string,
  ) {
    const start = await r.request('/passport/start')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    void store
    return r.request(`/passport/callback?${query(state)}`)
  }

  it('exchanges the code and hands the session back in a FRAGMENT', async () => {
    const store = memoryPkce()
    const res = await startThen(router({ pkce: store.pkce }), store, (s) => `code=abc&state=${s}`)

    expect(res.status).toBe(302)
    const location = res.headers.get('location')!
    // A fragment is never sent to a server, so the tokens cannot land in an access log
    // or in a `Referer` header on the way to the completion page.
    expect(location).toBe(
      'https://app.test/auth/passport/complete#access_token=at&refresh_token=rt',
    )
    expect(location).not.toContain('?access_token')
  })

  it('writes the identity link with the session’s own subject', async () => {
    const store = memoryPkce()
    const a = access()
    await startThen(
      createPassportAuthRouter({
        env: env(),
        access: a,
        pkce: store.pkce,
        exchange: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
        verifyToken: async () => ({ sub: 'passport-sub', email: MEMBER }),
        hasAnyEntitlement: async () => true,
      }),
      store,
      (s) => `code=abc&state=${s}`,
    )

    // Passport's `sub`, because this app accepts Passport as a second trusted issuer —
    // so that IS what the session resolves to. The rule is the value the session
    // resolves to, never the label on it.
    expect(
      (a as unknown as { linkIdentity: { mock: { calls: unknown[][] } } }).linkIdentity.mock
        .calls[0],
    ).toEqual(['passport-sub', MEMBER])
  })

  // Single-use is structural: redeeming deletes the row, so a replay finds nothing.
  it('refuses a replayed callback', async () => {
    const store = memoryPkce()
    const r = router({ pkce: store.pkce })
    const start = await r.request('/passport/start')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!

    const first = await r.request(`/passport/callback?code=abc&state=${state}`)
    expect(first.headers.get('location')).toContain('/auth/passport/complete')

    const replay = await r.request(`/passport/callback?code=abc&state=${state}`)
    expect(replay.headers.get('location')).toContain('error=passport_sso_failed')
  })

  it('refuses an unknown state', async () => {
    const res = await router().request('/passport/callback?code=abc&state=never-issued')
    expect(res.headers.get('location')).toContain('error=passport_sso_failed')
  })

  it('gives each failure class its OWN code', async () => {
    const store = memoryPkce()
    const r = router({ pkce: store.pkce })

    // Passport itself refused, before the person ever came back.
    const denied = await r.request('/passport/callback?error=access_denied&state=x')
    expect(denied.headers.get('location')).toContain('error=passport_sso_failed')

    // "Never left our app" and "came back and the exchange failed" are entirely
    // different investigations, and the query param is the only thing that splits them.
    const noAccess = await startThen(
      createPassportAuthRouter({
        env: env(),
        access: access({
          forPlatformUser: async () => ({
            platformUserId: 'p-1',
            organizationId: 'org-1',
            orgRole: 'Member',
            rolesByUnit: {},
            hasAccess: false,
          }),
        }),
        pkce: store.pkce,
        exchange: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
        verifyToken: async () => ({ sub: 's', email: MEMBER }),
        hasAnyEntitlement: async () => true,
      }),
      store,
      (s) => `code=abc&state=${s}`,
    )
    expect(noAccess.headers.get('location')).toContain('error=no_access')
  })

  it('refuses when the exchange fails', async () => {
    const store = memoryPkce()
    const res = await startThen(
      createPassportAuthRouter({
        env: env(),
        access: access(),
        pkce: store.pkce,
        exchange: async () => null,
        verifyToken: async () => ({ sub: 's', email: MEMBER }),
        hasAnyEntitlement: async () => true,
      }),
      store,
      (s) => `code=abc&state=${s}`,
    )
    expect(res.headers.get('location')).toContain('error=passport_sso_failed')
  })

  it('refuses when the exchanged token fails verification', async () => {
    const store = memoryPkce()
    const res = await startThen(
      createPassportAuthRouter({
        env: env(),
        access: access(),
        pkce: store.pkce,
        exchange: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
        verifyToken: async () => null,
        hasAnyEntitlement: async () => true,
      }),
      store,
      (s) => `code=abc&state=${s}`,
    )
    expect(res.headers.get('location')).toContain('error=passport_sso_failed')
  })

  // The resolver returns an existing local row on a bare email match, so a REMOVED
  // member with a legacy row would walk straight in if this were a skip rather than a
  // denial.
  it('DENIES a non-member rather than skipping the access check', async () => {
    const store = memoryPkce()
    const res = await startThen(
      createPassportAuthRouter({
        env: env(),
        access: access({
          membershipForEmail: async () => ({ ok: false, reason: 'none' }) as never,
        }),
        pkce: store.pkce,
        exchange: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
        verifyToken: async () => ({ sub: 's', email: STRANGER }),
        hasAnyEntitlement: async () => true,
      }),
      store,
      (s) => `code=abc&state=${s}`,
    )
    expect(res.headers.get('location')).toContain('error=no_access')
  })

  // Before the projection lands every derivation is empty, so denying on that would
  // lock out the whole company on the day SSO is switched on. Membership itself never
  // fails open, which is what keeps this from being a hole.
  it('fails OPEN on access while no entitlement has synced', async () => {
    const store = memoryPkce()
    const res = await startThen(
      createPassportAuthRouter({
        env: env(),
        access: access({
          forPlatformUser: async () => ({
            platformUserId: 'p-1',
            organizationId: 'org-1',
            orgRole: 'Owner',
            rolesByUnit: {},
            hasAccess: false,
          }),
        }),
        pkce: store.pkce,
        exchange: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
        verifyToken: async () => ({ sub: 's', email: MEMBER }),
        hasAnyEntitlement: async () => false,
      }),
      store,
      (s) => `code=abc&state=${s}`,
    )
    expect(res.headers.get('location')).toContain('/auth/passport/complete')
  })

  it('still completes the login when the identity-link write fails', async () => {
    const store = memoryPkce()
    const res = await startThen(
      createPassportAuthRouter({
        env: env(),
        access: access({
          linkIdentity: async () => {
            throw new Error('db down')
          },
        }),
        pkce: store.pkce,
        exchange: async () => ({ accessToken: 'at', refreshToken: 'rt' }),
        verifyToken: async () => ({ sub: 's', email: MEMBER }),
        hasAnyEntitlement: async () => true,
      }),
      store,
      (s) => `code=abc&state=${s}`,
    )

    // The session is valid and derivation simply finds no link until the next login.
    // Failing the login here would be worse than the degraded state.
    expect(res.headers.get('location')).toContain('/auth/passport/complete')
  })
})

// ---------------------------------------------------------------------------
// Property 4, as a regression: /passport/start must NEVER return JSON
// ---------------------------------------------------------------------------
//
// Found by curling a running server, not by a test. `APP_BASE_URL` was unset, so the
// failure branch built a relative URL and handed it to `Response.redirect` — which
// requires an absolute URL and THROWS on a relative one. The throw escaped to the error
// boundary and the route answered a JSON 500, which is exactly what property 4 exists
// to prevent: this route is reached by top-level navigation, so that body renders as the
// entire page.
describe('the login routes never answer JSON on a navigation', () => {
  it('redirects RELATIVELY when APP_BASE_URL is unset, rather than throwing', async () => {
    const r = createPassportAuthRouter({
      env: env({ APP_BASE_URL: undefined, PASSPORT_SUPABASE_URL: undefined }),
      access: access(),
      pkce: memoryPkce().pkce,
    })

    const res = await r.request('/passport/start')

    // Relative is CORRECT for single-origin dev, where Vite proxies /api to the server.
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/login?error=passport_unavailable')
  })

  it('redirects rather than 500ing when something unexpected throws', async () => {
    const r = createPassportAuthRouter({
      env: env(),
      access: access(),
      // A store that throws on REDEEM, which no anticipated branch handles.
      pkce: createPkce({
        create: async () => {},
        redeem: async () => {
          throw new Error('pool exhausted')
        },
      }),
    })

    const res = await r.request('/passport/callback?code=abc&state=anything')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=passport_sso_failed')
  })

  it('redirects rather than 500ing when the projection is unreachable at start', async () => {
    const r = createPassportAuthRouter({
      env: env(),
      access: access(),
      pkce: createPkce({
        create: async () => {
          throw new Error('ECONNREFUSED')
        },
        redeem: async () => null,
      }),
    })

    const res = await r.request('/passport/start')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=passport_unavailable')
  })
})
