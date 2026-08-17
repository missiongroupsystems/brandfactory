import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loginErrorMessage, passportStartUrl, resolveLoginRoute } from './resolveLogin'

/**
 * Step 1 of the login: the routing call and the error copy.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6B.
 *
 * Most of these are failure cases, because **the failure direction is the design**. There
 * is no assertion here that a working server returns `passport` and that this is nice; the
 * interesting property is that *nothing* returns `passport` unless the server says so in
 * as many words.
 */
const fetchMock = vi.fn()

describe('resolveLoginRoute', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes to Passport only when the server says so', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ route: 'passport' })))
    await expect(resolveLoginRoute('member@example.com')).resolves.toBe('passport')
  })

  it('POSTs the email as JSON to the app’s OWN endpoint, not to Passport', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ route: 'app-native' })))
    await resolveLoginRoute('someone@example.com')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    // Relative to this app. A request straight to Passport from the browser would need a
    // credential in the bundle and would leak the address to a third origin.
    expect(url).toBe('/api/auth/resolve-login')
    expect(url.startsWith('http')).toBe(false)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'someone@example.com' })
  })

  // ── The fallback, four ways ───────────────────────────────────────────────
  //
  // Every one of these must answer `app-native`. Routing somebody to hosted login
  // because a request FAILED strands a non-member at Passport with no account and no way
  // back; the reverse merely shows a member a magic-link step, which is visible and
  // recoverable. The asymmetry is why there is no "retry" here.

  it('falls back to app-native when the server errors', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    await expect(resolveLoginRoute('a@example.com')).resolves.toBe('app-native')
  })

  it('falls back to app-native when the route does not exist yet', async () => {
    // An older deployment, or this build talking to a server that predates phase 6A. The
    // login must keep working exactly as it did before this phase.
    fetchMock.mockResolvedValue(new Response('Not Found', { status: 404 }))
    await expect(resolveLoginRoute('a@example.com')).resolves.toBe('app-native')
  })

  it('falls back to app-native when the network throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(resolveLoginRoute('a@example.com')).resolves.toBe('app-native')
  })

  it('falls back to app-native on a body that is not the expected shape', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway timeout</html>'))
    await expect(resolveLoginRoute('a@example.com')).resolves.toBe('app-native')
  })

  it('treats any value other than the exact string "passport" as app-native', async () => {
    // Not `truthy`, not `startsWith`. A proxy that answers `{"route": true}` must not be
    // able to push a stranger into hosted login.
    for (const route of [true, 1, 'Passport', 'passport ', ['passport'], null]) {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ route })))
      await expect(resolveLoginRoute('a@example.com')).resolves.toBe('app-native')
    }
  })
})

describe('passportStartUrl', () => {
  it('points at the server, which is what holds the PKCE verifier', () => {
    expect(passportStartUrl()).toBe('/api/auth/passport/start')
  })
})

describe('loginErrorMessage', () => {
  it('gives no_access its own message, because it is an answer and not a failure', () => {
    const msg = loginErrorMessage('no_access')
    expect(msg).toMatch(/no access/i)
    // It must not tell them to try again — retrying cannot fix it.
    expect(msg).not.toMatch(/try again/i)
    expect(msg).toMatch(/administrator/i)
  })

  it('points the two retryable classes at the magic link', () => {
    for (const code of ['passport_unavailable', 'passport_sso_failed']) {
      expect(loginErrorMessage(code)).toMatch(/magic link/i)
    }
  })

  it('returns null for a code that is not ours', () => {
    // The load-bearing case. `/login` reads Supabase's `?error=` out of the same
    // parameter, so a catch-all `default:` here would swallow the magic-link error and
    // replace it with an SSO message that has nothing to do with what happened.
    expect(loginErrorMessage('access_denied')).toBeNull()
    expect(loginErrorMessage('otp_expired')).toBeNull()
    expect(loginErrorMessage('server_error')).toBeNull()
  })

  it('returns null for no code at all', () => {
    expect(loginErrorMessage(null)).toBeNull()
    expect(loginErrorMessage('')).toBeNull()
  })
})
