const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

/**
 * Step 1 of the login: where does this email belong?
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6B.
 *
 * **Two routes, and the server keeps it that way.** `passport` means "this is an active
 * Passport member, send them to hosted login"; `app-native` means "show the password
 * step". A non-member and a nonexistent address both answer `app-native` — that is
 * deliberate, and it is why there is no third value to handle here.
 *
 * The response deliberately carries **one field**. If a future version starts returning
 * `exists`, `reason` or a message, that is the user-enumeration oracle coming back and
 * the fix belongs on the server, not in a branch here.
 */
export type LoginRoute = 'passport' | 'app-native'

/**
 * Ask the server, and **fall back to `app-native` on any failure.**
 *
 * That fallback is the whole error strategy, and it is safe in exactly one direction: a
 * member routed to `app-native` by mistake sees a password step they may not be able to
 * use, which is recoverable and visible. The reverse — routing somebody to hosted login
 * because a request failed — strands a non-member at Passport with no account and no way
 * back.
 *
 * It also means a server that is down, or an old deployment with no such route, leaves
 * the login working exactly as it did before this phase.
 */
export async function resolveLoginRoute(email: string): Promise<LoginRoute> {
  try {
    const res = await fetch(`${API_BASE}/auth/resolve-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) return 'app-native'
    const body = (await res.json()) as { route?: unknown }
    return body.route === 'passport' ? 'passport' : 'app-native'
  } catch {
    return 'app-native'
  }
}

/** Where the browser goes for hosted login. A FULL-PAGE navigation, not a fetch. */
export function passportStartUrl(): string {
  return `${API_BASE}/auth/passport/start`
}

/**
 * Every `?error=` code the server's hosted-login routes redirect with.
 *
 * **A CLOSED set, and that is what makes it usable as a guard.** `/login` also has to read
 * Supabase's own `?error=` for the magic-link failures, and those two namespaces share one
 * parameter name. Without a closed set the choice is to render every unknown code as an
 * SSO failure — swallowing the magic-link error — or to render our own codes raw, showing
 * somebody the string `no_access`. Both have been the bug here.
 *
 * `passport-auth-error-codes.test.ts` sweeps the server for `fail('…')` and fails if it
 * emits a code missing from this set. A code that is not here renders as **nothing at
 * all**: the redirect works, the person lands on a login screen with no explanation, and
 * there is no error anywhere to find it by.
 */
export const PASSPORT_LOGIN_ERROR_CODES = [
  'no_access',
  'passport_unavailable',
  'rate_limited',
  'passport_sso_failed',
] as const

export type PassportLoginErrorCode = (typeof PASSPORT_LOGIN_ERROR_CODES)[number]

/**
 * Human copy for the codes above. `null` for anything else — including Supabase's own
 * codes, which the caller then handles as before.
 *
 * **One message per class is deliberate, and it is not laziness.** A person cannot act on
 * the difference between "the exchange failed" and "the state had expired", so telling
 * them apart helps nobody — while the query parameter still splits the *investigation* in
 * half, which is what it is for. `no_access` is the one genuinely different case: it is
 * not a failure to retry, it is an answer.
 */
export function loginErrorMessage(code: string | null): string | null {
  switch (code) {
    case 'no_access':
      return "You're signed in, but this account has no access to BrandFactory yet. Ask an administrator to add you."
    case 'passport_unavailable':
      return 'Single sign-on is unavailable right now. You can still sign in with a magic link below.'
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.'
    case 'passport_sso_failed':
      return 'Single sign-on did not complete. Try again, or sign in with a magic link below.'
    default:
      return null
  }
}
