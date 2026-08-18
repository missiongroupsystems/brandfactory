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
import { hostedLoginRecentlyFailed, recordHostedLoginFailure } from '../passport/outage'
import { sendMagicLink } from '../passport/magic-link'
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
 * **That gap is now closed by `POST /auth/magic-link` below**, added 2026-08-18. The browser
 * no longer talks to GoTrue directly for the magic link: it asks this server, which refuses an
 * active member while hosted login is working.
 *
 * It is closed in the **break-glass** form, not the strict one, and the difference is a
 * decision rather than an implementation detail — see that route's own header. Strict would
 * also stop member sign-in during a Passport outage, which is the opposite of the trade
 * decision `D1-b` already made.
 *
 * The Google button is a separate door and is **still open** — see the route's header.
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
  /** Injectable so the magic-link proxy can be tested without a network. */
  sendMagicLink?: typeof sendMagicLink
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

  /**
   * Where a magic link lands. **Absolute, always** — GoTrue rejects a relative `redirect_to`.
   *
   * `frontendPath` cannot be reused here: it returns a relative path when `APP_BASE_URL` is
   * unset, which is correct for a same-origin browser redirect and useless to GoTrue.
   *
   * So `APP_BASE_URL` first, and the request's `Origin` second. The fallback is what the
   * browser itself used to supply (`${window.location.origin}/login`) before this call moved
   * to the server, and it is what keeps single-origin development working with no new setting.
   *
   * **A caller-supplied origin is not a hole here, and the reason is not "we trust it".**
   * GoTrue validates `redirect_to` against the project's own allow-list and refuses anything
   * outside it — that allow-list is the control, it lives in the Supabase dashboard, and it
   * was already the only thing standing behind the browser's version of this call.
   *
   * `/login`, not `/`, for the reason the browser had: `SupabaseAuthProvider` mounts there and
   * exchanges the `?code=`, while landing on `/` lets the index route redirect first and strip
   * the query.
   */
  function magicLinkRedirect(c: Context<AppEnv>): string {
    const base = env.APP_BASE_URL?.replace(/\/+$/, '') ?? c.req.header('origin') ?? ''
    return `${base}/login`
  }

  const send = deps.sendMagicLink ?? sendMagicLink

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
   * `POST /auth/magic-link` — step 2's magic link, proxied so the routing decision becomes
   * ENFORCEMENT.
   *
   * ---------------------------------------------------------------------------
   * What this closes
   * ---------------------------------------------------------------------------
   *
   * `/auth/resolve-login` decides where an address belongs. Until this route existed that
   * decision was advisory, because the browser called GoTrue directly: a member could ask
   * BrandFactory's own project for a link and authenticate around Passport's MFA, session
   * policy, revocation and audit. The API was the policy, and the API said yes.
   *
   * ---------------------------------------------------------------------------
   * ⚠️ BREAK-GLASS, not strict — a decision, not an implementation detail
   * ---------------------------------------------------------------------------
   *
   * A member is refused **while hosted login is working**, and allowed through when it is
   * observably not (`passport/outage.ts`).
   *
   * Strict — refusing always — is the stronger guarantee and was rejected for the same reason
   * `D1-b` was chosen: it would stop member sign-in during a Passport outage, which is exactly
   * the situation the rest of this integration goes out of its way to survive. The cost is
   * stated rather than hidden: **somebody who controls a member's mailbox can wait for an
   * outage.** So "MFA is enforced" becomes "MFA is enforced unless Passport is down", which is
   * a materially weaker claim and a harder one to put to an auditor.
   *
   * Three things bound it:
   *
   * - the door opens only on an **observed** hosted-login failure, never on a guess, and it
   *   defaults shut on every uncertainty;
   * - it closes again ten minutes after the last failure;
   * - every break-glass sign-in is logged as its own event, so "was MFA enforced for this
   *   session?" is one query rather than unanswerable.
   *
   * ---------------------------------------------------------------------------
   * The response is the same either way
   * ---------------------------------------------------------------------------
   *
   * `{ ok: true }` whether a link was sent, the member was refused, or GoTrue errored.
   * Reporting the difference would rebuild the account-existence oracle `/auth/resolve-login`
   * is shaped to avoid — and the client does not need it, because the screen says "check your
   * email" in every case.
   *
   * The person is not left stranded: a refused member is a member, and hosted login is
   * working, so their route is the button they were already sent to.
   *
   * ---------------------------------------------------------------------------
   * ⚠️ The Google button is a SEPARATE door and is still open
   * ---------------------------------------------------------------------------
   *
   * `signInWithOAuth` redirects the browser straight to Google and cannot be proxied the same
   * way — there is no request body to relay, only a top-level navigation. Closing it means
   * either dropping Google for members or routing it through a server-side OAuth start of our
   * own. That is a separate piece of work and it is NOT done here.
   */
  router.post('/magic-link', async (c) => {
    const log = c.get('log')

    if (!allow(`magic-link:ip:${clientIp((n) => c.req.header(n))}`, IP_LIMIT, WINDOW_MS)) {
      return c.json({ code: 'RATE_LIMITED', message: 'too many requests' }, 429)
    }

    let body: { email?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ code: 'MALFORMED', message: 'malformed request' }, 400)
    }

    const email = typeof body.email === 'string' ? body.email.trim() : ''
    // Length only, never a format check — the same property `/resolve-login` holds, and for
    // the same reason: a different answer for a malformed address is still an oracle.
    if (!email || Buffer.byteLength(email, 'utf8') > MAX_EMAIL_OCTETS) {
      return c.json({ code: 'MALFORMED', message: 'malformed request' }, 400)
    }

    if (!allow(`magic-link:email:${email.toLowerCase()}`, EMAIL_LIMIT, WINDOW_MS)) {
      return c.json({ code: 'RATE_LIMITED', message: 'too many requests' }, 429)
    }

    const route = await resolveLoginRoute(env, access, email)

    if (route === 'passport') {
      const outage = hostedLoginRecentlyFailed()
      if (!outage) {
        // Refused. Same body as success — see the note above.
        log?.info('magic link: refused an active member; hosted login is up')
        return c.json({ ok: true }, 200)
      }
      // Its OWN log line, not a debug detail. This is the record that answers "was MFA
      // enforced for this sign-in?", and without it the question has no answer at all.
      log?.warn('magic link: BREAK-GLASS — member allowed because hosted login recently failed')
    }

    await send({ env, log }, email, magicLinkRedirect(c))
    return c.json({ ok: true }, 200)
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
    const fail = (code: string) => {
      // `passport_unavailable` is the ONLY code that opens the break-glass door — see
      // `passport/outage.ts`. `no_access`, `rate_limited` and a failed exchange are Passport
      // working correctly and answering, and counting them as an outage would hand the bypass
      // to somebody it just turned away.
      if (code === 'passport_unavailable') recordHostedLoginFailure()
      return c.redirect(frontendPath(`/login?error=${encodeURIComponent(code)}`, warn), 302)
    }

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
    const fail = (code: string) => {
      // `passport_unavailable` is the ONLY code that opens the break-glass door — see
      // `passport/outage.ts`. `no_access`, `rate_limited` and a failed exchange are Passport
      // working correctly and answering, and counting them as an outage would hand the bypass
      // to somebody it just turned away.
      if (code === 'passport_unavailable') recordHostedLoginFailure()
      return c.redirect(frontendPath(`/login?error=${encodeURIComponent(code)}`, warn), 302)
    }

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
