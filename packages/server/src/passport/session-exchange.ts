import type { Env } from '../env'
import type { Logger } from '../logger'

/**
 * Redeem a hosted-login authorization code for a session.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6b.
 *
 * **A hand-rolled call rather than an SDK method, and deliberately so.** The SDK
 * exposes no `sessionExchange`. This is the sanctioned exception, not a licence: an
 * `auth_handoff_code` is **not one of the eight synced aggregates**, so redeeming it
 * is a code redemption rather than a consumer write, and rule 3 does not touch it.
 * Hosted login stops working without this call, which is why the rule-3 sweep must
 * not "tidy" it away — deleting it is the mirror-image failure of leaving a write in,
 * and it takes login down rather than leaking anything.
 *
 * Its own module for a second reason: this is the only server-side record of *why* a
 * hosted login failed. The redirect the browser receives is deliberately flat, so
 * every way the exchange can fail must log from one place — and **no line here may
 * carry the code, the verifier or a token.**
 */

const SESSION_EXCHANGE_PATH = '/api/v1/apps/me/session-exchange'
const TIMEOUT_MS = 10_000

export interface ExchangedSession {
  accessToken: string
  refreshToken: string
  expiresAt?: number
}

/**
 * POST Passport's session-exchange. Returns null on ANY transport or HTTP failure.
 *
 * A drifted `PASSPORT_SSO_CALLBACK_URL` — the classic misconfiguration, since it must
 * match Passport's per-app allow-list byte for byte — surfaces here as a non-2xx,
 * never as an exception. Passport will not say *which* check failed; that is
 * deliberate. So debug from this side: expired code? wrong verifier? URI mismatch?
 */
export async function exchangeSessionCode(
  env: Env,
  code: string,
  verifier: string,
  log?: Logger,
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangedSession | null> {
  // The trailing-slash strip is load-bearing: a configured trailing slash yields
  // `//api/v1/...`, which Passport answers with a flat 404 that looks nothing like a
  // configuration error.
  const apiUrl = env.PASSPORT_API_URL?.replace(/\/+$/, '')
  const apiKey = env.PASSPORT_API_KEY
  const redirectUri = env.PASSPORT_SSO_CALLBACK_URL

  if (!apiUrl || !apiKey || !redirectUri) {
    log?.warn('passport exchange refused: the Passport API is not configured')
    return null
  }

  let response: Response
  try {
    response = await fetchImpl(`${apiUrl}${SESSION_EXCHANGE_PATH}`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      // `redirect_uri` is RE-SENT, and that is not redundant (RFC 6749 §4.1.3): it
      // binds the code to the URI it was issued for, closing code substitution across
      // two registered callbacks of the same app.
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    log?.warn('passport exchange: transport failure', { message: (err as Error).message })
    return null
  }

  if (!response.ok) {
    log?.warn('passport exchange: Passport refused', { status: response.status })
    return null
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    log?.warn('passport exchange: malformed JSON in response')
    return null
  }

  if (typeof body !== 'object' || body === null) {
    log?.warn('passport exchange: non-object JSON body')
    return null
  }

  const {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  } = body as Record<string, unknown>

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    log?.warn('passport exchange: response missing access_token or refresh_token')
    return null
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : undefined,
  }
}
