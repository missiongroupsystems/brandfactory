import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose'
import type { Env } from '../env'

/**
 * Verifying a token issued by **Passport's** Supabase project.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6c.
 *
 * BrandFactory accepts **two** issuers: its own project (app-native sessions) and
 * Passport's (hosted-login sessions). The auth adapter owns the first;
 * `middleware/auth.ts` falls through to this for the second.
 *
 * **This only ever ADDS an accepted issuer.** Turning SSO on cannot reject a session
 * that works today, and clearing the config cannot lock anyone out. Reversible in
 * both directions, which is what makes `PASSPORT_SSO_ENABLED` a safe kill switch.
 *
 * ---------------------------------------------------------------------------
 * The clause-order trap, which cost another consumer its whole SSO rollout
 * ---------------------------------------------------------------------------
 *
 * A Passport-issued token presented to BrandFactory's own JWKS fails with "no
 * signing key matches this kid" — and that is the **normal** case for an SSO user,
 * not an outage. The fallthrough must fire on it.
 *
 * The failure mode is subtle: if a caller catches a *narrower* error first in order
 * to give it a nicer message, that clause intercepts the very error the fallthrough
 * exists to handle, and every Passport-authenticated request then 401s
 * deterministically no matter how valid the token is. So the two predicates below are
 * exported separately and the caller must check **expiry first, foreign-issuer
 * second** — `isExpiredError` is the terminal one.
 *
 * An **expired** token is terminal and must never be retried against a second
 * issuer: it will fail there too, and the retry only hides the real reason. Expiry is
 * a fact about the token, not about which project signed it.
 */

export interface PassportClaims {
  /** The subject, in PASSPORT's project's UUID space — not ours. */
  sub: string
  /**
   * The verified email, and **the only key that resolves a local user**.
   *
   * Passport's `sub` belongs to a foreign project and `platform_user_id` is never
   * synced into any auth provider, so email is the one identifier both sides hold.
   */
  email: string
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null
let cachedIssuer: string | null = null

/** Test seam. Never call from a request path. */
export function __resetPassportJwks(): void {
  cachedJwks = null
  cachedIssuer = null
}

/**
 * Whether SSO is actually live in this environment.
 *
 * **Gated on the project URL as well as the flag**, so the flag alone can never
 * activate anything: an environment that simply lacks Passport's project — local, CI
 * — stays app-native on its own, with no flag for anyone to remember.
 *
 * The flag defaults ON. It is a break-glass switch rather than a rollout toggle: set
 * it `false` to disable SSO during an incident *while keeping the configuration in
 * place*, which is safe only because the app-native branch always exists.
 */
export function ssoActive(env: Env): boolean {
  return env.PASSPORT_SSO_ENABLED && Boolean(env.PASSPORT_SUPABASE_URL)
}

function passportJwks(
  env: Env,
): { jwks: ReturnType<typeof createRemoteJWKSet>; issuer: string } | null {
  const base = env.PASSPORT_SUPABASE_URL?.replace(/\/+$/, '')
  if (!base) return null

  const issuer = `${base}/auth/v1`
  // Rebuilt only when the configured project changes: `createRemoteJWKSet` caches
  // keys internally, and constructing one per request would refetch the key set on
  // every login.
  if (!cachedJwks || cachedIssuer !== issuer) {
    cachedJwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`))
    cachedIssuer = issuer
  }
  return { jwks: cachedJwks, issuer }
}

/** True when the failure means "this token was not signed by the project I asked about". */
export function isForeignIssuerError(err: unknown): boolean {
  return (
    err instanceof joseErrors.JWKSNoMatchingKey ||
    err instanceof joseErrors.JWSSignatureVerificationFailed ||
    err instanceof joseErrors.JWTClaimValidationFailed
  )
}

/** True when the token is genuinely expired — TERMINAL, never retried elsewhere. */
export function isExpiredError(err: unknown): boolean {
  return err instanceof joseErrors.JWTExpired
}

/**
 * Verify against Passport's project and return the claims we need.
 *
 * Returns null when SSO is not configured, when the token is not Passport's, or when
 * it carries **no email claim** — the last is a refusal rather than a partial
 * success, because there is then nothing to resolve a local user by, and guessing
 * from `sub` is the mistake this whole design exists to prevent.
 */
export async function verifyPassportToken(env: Env, token: string): Promise<PassportClaims | null> {
  const config = passportJwks(env)
  if (!config) return null

  try {
    const { payload } = await jwtVerify(token, config.jwks, { issuer: config.issuer })
    const sub = payload.sub
    const email = typeof payload.email === 'string' ? payload.email : null
    if (!sub || !email) return null
    return { sub, email }
  } catch {
    return null
  }
}
