import { Hono, type Context } from 'hono'
import type { AppEnv } from '../context'
import type { Env } from '../env'
import type { Logger } from '../logger'
import { createPassportAccess, type PassportAccessService } from '../passport/access'
import { createHostedLoginGate } from '../passport/gate'
import { resolveLoginRoute } from '../passport/login-routing'
import { createPkce, type Pkce } from '../passport/pkce'
import { allow } from '../passport/rate-limit'
import { exchangeSessionCode } from '../passport/session-exchange'
import { ssoActive, verifyPassportToken } from '../passport/token'
import { hasAnyPassportEntitlement } from '@brandfactory/db'

/**
 * The standard email-first login, server half.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6a–6b.
 *
 * ```
 * step 1   [ email ] (Continue)          <- ONE field. No password yet.
 *              |
 *              v  POST /auth/resolve-login  ->  { route: 'passport' | 'app-native' }
 *              |
 *    route=passport                        route=app-native
 *              |                                    |
 *    full-page navigation to              reveal the existing magic-link and
 *    /auth/passport/start                 Google buttons IN PLACE, against
 *    -> Passport /authorize               BrandFactory's own project
 *    -> returns already signed in
 * ```
 *
 * Mounted OUTSIDE the auth gate: it necessarily runs before anybody has proven
 * anything.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ This router is the DECISION, not the ENFORCEMENT
 * ---------------------------------------------------------------------------
 *
 * A routing decision made only in the client is advisory. If the API accepts the
 * call, the API is the policy — and BrandFactory's magic link and Google button go
 * **straight from the browser to Supabase GoTrue**, with no server endpoint in
 * between. So a member can still request a magic link from BrandFactory's own project
 * and authenticate around Passport's MFA, session policy and revocation entirely.
 *
 * That gap is real and is NOT closed by this file. It is recorded in
 * `docs/completions/passport-sync-consumer-phase-6.md` §"the gap", with the fix
 * (proxy the magic-link request through a server endpoint that refuses an active
 * member, keeping the response non-committal either way). Do not read the existence of
 * this router as the door being shut.
 */

/** RFC 5321's maximum reverse-path length. Not a validity check — a key-space bound. */
const MAX_EMAIL_OCTETS = 320

const IP_LIMIT = 30
const EMAIL_LIMIT = 10
const WINDOW_MS = 60_000

export interface PassportAuthDeps {
  env: Env
  /** Injectable for tests; defaults to the real projection-backed service. */
  access?: PassportAccessService
  pkce?: Pkce
  /** Injectable so the callback can be tested without a network. */
  exchange?: typeof exchangeSessionCode
  verifyToken?: typeof verifyPassportToken
  hasAnyEntitlement?: () => Promise<boolean>
}

function clientIp(header: (name: string) => string | undefined): string {
  return header('Fly-Client-IP') ?? header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
}

export function createPassportAuthRouter(deps: PassportAuthDeps) {
  const env = deps.env
  const access = deps.access ?? createPassportAccess()
  const pkce = deps.pkce ?? createPkce()
  const exchange = deps.exchange ?? exchangeSessionCode
  const verify = deps.verifyToken ?? verifyPassportToken
  const hasAnyEntitlement = deps.hasAnyEntitlement ?? hasAnyPassportEntitlement
  const gate = createHostedLoginGate({ access, hasAnyEntitlement })

  /**
   * A path on the FRONTEND, absolute when `APP_BASE_URL` is set and relative otherwise.
   *
   * **Both topologies are real here, which is why this is not simply required.** In
   * development BrandFactory is single-origin — Vite proxies `/api`, `/rt` and `/blobs`
   * to the server — so a *relative* redirect to `/login` is exactly right and an
   * absolute one would be wrong. In a split-origin deployment (`app.example.com` vs
   * `api.example.com`) only an absolute URL reaches the web app, and a relative one
   * resolves against the BACKEND origin and 404s with a live session in the fragment.
   *
   * So: use the configured origin when there is one, fall back to relative, and warn
   * when it is missing — because in the split-origin case that warning is the only
   * thing standing between an operator and a login that "completes" onto a dead URL.
   *
   * **Never `Response.redirect` with this**: that requires an absolute URL and THROWS
   * on a relative one, which is how a missing `APP_BASE_URL` turned every failure
   * branch of `/passport/start` into a JSON 500 — the exact thing that route must never
   * return. `c.redirect` accepts both.
   */
  function frontendPath(path: string, log?: (msg: string) => void): string {
    const base = env.APP_BASE_URL?.replace(/\/+$/, '')
    if (!base) {
      log?.(
        'APP_BASE_URL is not set — redirecting to a RELATIVE path. Correct for ' +
          'single-origin dev via the Vite proxy; wrong for a split-origin deploy, where ' +
          'the browser resolves it against the API host and lands on a 404.',
      )
    }
    return `${base ?? ''}${path}`
  }

  const router = new Hono<AppEnv>()

  /**
   * `POST /auth/resolve-login` — step 1.
   *
   * Six security properties, every one deliberate:
   *
   * 1. **Two routes, never three.** A non-member and a nonexistent email are
   *    indistinguishable. A third route is the enumeration oracle, reintroduced by
   *    somebody improving an error message.
   * 2. **No email-format validation before routing.** Rejecting a malformed address up
   *    front leaks "this isn't even a valid email" *ahead of* the routing decision — a
   *    different answer for a different class of input is still an oracle. Only the
   *    LENGTH is capped.
   * 3. **Two rate-limit buckets: IP *and* email.** IP alone lets a botnet enumerate
   *    one address from many hosts; email alone lets one host sweep a list.
   * 4. (on `/passport/start`) every failure branch REDIRECTS rather than returning JSON.
   * 5. (on `/passport/start`) it is rate-limited, because it writes an unauthenticated row.
   * 6. **Both routes cost the same wall time** — the membership lookup runs
   *    unconditionally inside `resolveLoginRoute`.
   */
  router.post('/resolve-login', async (c) => {
    if (!allow(`resolve-login:ip:${clientIp((n) => c.req.header(n))}`, IP_LIMIT, WINDOW_MS)) {
      return c.json({ code: 'RATE_LIMITED', message: 'too many requests' }, 429)
    }

    let body: { email?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ code: 'MALFORMED', message: 'malformed request' }, 400)
    }

    const email = typeof body.email === 'string' ? body.email.trim() : ''

    // Length only — deliberately NOT a format check (property 2). The cap exists so an
    // unbounded string cannot grow the rate limiter's key space.
    if (!email || Buffer.byteLength(email, 'utf8') > MAX_EMAIL_OCTETS) {
      return c.json({ code: 'MALFORMED', message: 'malformed request' }, 400)
    }

    if (!allow(`resolve-login:email:${email.toLowerCase()}`, EMAIL_LIMIT, WINDOW_MS)) {
      return c.json({ code: 'RATE_LIMITED', message: 'too many requests' }, 429)
    }

    const route = await resolveLoginRoute(env, access, email)

    // The ONLY field. Adding `exists`, `reason` or `message` here is how the oracle
    // comes back.
    return c.json({ route }, 200)
  })

  /**
   * `GET /auth/passport/start` — begin the hosted-login redirect.
   *
   * **Every exit from this route is a REDIRECT, never JSON.** It is reached by
   * top-level browser navigation, so a JSON 429 or 500 body renders as the entire
   * page. That is also why the rate limit is applied inside the handler rather than as
   * middleware — it has to be able to redirect.
   */
  router.get('/passport/start', async (c) => {
    const log = c.get('log')
    const warn = (m: string) => log?.warn(m)
    const fail = (code: string) =>
      c.redirect(frontendPath(`/login?error=${encodeURIComponent(code)}`, warn), 302)

    // **A catch-all, and it is the point of property 4 rather than defensiveness.**
    // This route is reached by top-level browser NAVIGATION, so anything that escapes
    // to the error boundary renders its JSON body as the entire page. The anticipated
    // failures redirect below; this is what makes the UNanticipated ones redirect too.
    try {
      return await start(c, fail, log)
    } catch (err) {
      log?.error('passport start: unexpected failure', { message: (err as Error).message })
      return fail('passport_unavailable')
    }
  })

  async function start(
    c: Context<AppEnv>,
    fail: (code: string) => Response,
    log?: Logger,
  ): Promise<Response> {
    // Rate-limited because it writes an unauthenticated PKCE row on every hit.
    if (!allow(`passport-start:ip:${clientIp((n) => c.req.header(n))}`, IP_LIMIT, WINDOW_MS)) {
      return fail('rate_limited')
    }

    const dashboardUrl = env.PASSPORT_DASHBOARD_URL?.replace(/\/+$/, '')
    const appId = env.PASSPORT_APP_ID
    const callbackUrl = env.PASSPORT_SSO_CALLBACK_URL

    if (!ssoActive(env) || !dashboardUrl || !appId || !callbackUrl) {
      return fail('passport_unavailable')
    }

    let attempt
    try {
      attempt = await pkce.createAttempt()
    } catch (err) {
      log?.error('passport start: could not persist the PKCE attempt', {
        message: (err as Error).message,
      })
      return fail('passport_unavailable')
    }

    // The BROWSER target is Passport's FRONTEND — a different host from
    // `PASSPORT_API_URL`, which is the back channel. Confusing the two is the classic
    // hosted-login failure.
    //
    // `redirect_uri` is sent VERBATIM and must not be normalised: no lowercasing the
    // host, no stripping a trailing slash. Passport matches its per-app allow-list
    // exactly, and every normalisation is a chance for the string sent to differ from
    // the string registered.
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: callbackUrl,
      state: attempt.state,
      code_challenge: attempt.challenge,
      code_challenge_method: 'S256',
    })

    return c.redirect(`${dashboardUrl}/authorize?${params.toString()}`, 302)
  }

  /**
   * `GET /auth/passport/callback` — redeem the code and hand the session back.
   *
   * **Seven distinct ways to fail, each logged on its own line.** If they shared one,
   * the next person would be reading Passport's logs to work out which fired — and
   * Passport's answer for a failed exchange is a flat 403 that deliberately tells you
   * nothing.
   *
   * The session goes to the browser in a **URL FRAGMENT**, not a query string: a
   * fragment is never sent to a server, so the tokens cannot land in an access log or
   * in a `Referer` header on the way to the completion page.
   */
  router.get('/passport/callback', async (c) => {
    const log = c.get('log')
    const warn = (m: string) => log?.warn(m)
    const fail = (code: string) =>
      c.redirect(frontendPath(`/login?error=${encodeURIComponent(code)}`, warn), 302)

    // The same catch-all as `/passport/start`, for the same reason: this route is a
    // browser navigation, so a JSON error body would render as the whole page. Here it
    // matters more, because the person has already authenticated at Passport by the
    // time they arrive — a raw 500 would strand them mid-flow with no way back.
    try {
      return await callback(c, fail, log)
    } catch (err) {
      log?.error('passport callback: unexpected failure', { message: (err as Error).message })
      return fail('passport_sso_failed')
    }
  })

  async function callback(
    c: Context<AppEnv>,
    fail: (code: string) => Response,
    log?: Logger,
  ): Promise<Response> {
    const warn = (m: string) => log?.warn(m)
    const url = new URL(c.req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const oauthError = url.searchParams.get('error')

    if (oauthError) {
      log?.warn('passport callback: Passport returned an error', { error: oauthError })
      return fail('passport_sso_failed')
    }
    if (!code || !state) {
      log?.warn('passport callback: missing code or state')
      return fail('passport_sso_failed')
    }

    // Single-use by construction: redeeming deletes the row, so a replayed callback
    // finds nothing.
    const verifier = await pkce.redeemAttempt(state)
    if (!verifier) {
      log?.warn('passport callback: no live attempt for that state (replay or expiry)')
      return fail('passport_sso_failed')
    }

    const session = await exchange(env, code, verifier, log)
    if (!session) {
      // `exchangeSessionCode` has already logged the specific transport or HTTP reason.
      return fail('passport_sso_failed')
    }

    const claims = await verify(env, session.accessToken)
    if (!claims) {
      log?.warn('passport callback: exchanged token failed verification or carried no email')
      return fail('passport_sso_failed')
    }

    // The access gate. This callback is the only place a Passport-backed session is
    // established, so it is the only place the gate can live.
    const outcome = await gate(claims.email)
    if (!outcome.allowed) {
      log?.warn('passport callback: refused', { reason: outcome.reason })
      return fail('no_access')
    }

    // Write OUR identity-link row, keyed by the subject this session will actually
    // resolve to — which for a hosted-login session is Passport's `sub`, because this
    // app accepts Passport as a second trusted issuer. Every login, not just the
    // first: it is idempotent and self-heals a stale row.
    //
    // Non-fatal. The session is valid and derivation simply finds no link until the
    // next login; failing the login here would be worse than the degraded state.
    try {
      await access.linkIdentity(claims.sub, claims.email)
    } catch (err) {
      log?.error('passport callback: identity link write failed', {
        message: (err as Error).message,
      })
    }

    const fragment = new URLSearchParams({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    })

    // Nothing fallible may follow this point: a failure after the tokens exist would
    // hide a session that already exists.
    return c.redirect(frontendPath(`/auth/passport/complete#${fragment.toString()}`, warn), 302)
  }

  return router
}
