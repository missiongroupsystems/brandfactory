import type { Env } from '../env'
import type { Logger } from '../logger'

/**
 * Ask BrandFactory's own GoTrue for a magic link, from the SERVER.
 *
 * Plan: the magic-link proxy — phase 6d's recorded gap.
 *
 * ---------------------------------------------------------------------------
 * Why the server sends it at all
 * ---------------------------------------------------------------------------
 *
 * Until now the browser called `signInWithOtp` directly with the anon key, which meant the
 * routing decision in `/auth/resolve-login` was **advisory**: a member could simply ask
 * BrandFactory's own project for a link and authenticate around Passport's MFA, session policy
 * and audit. Moving the call here is what turns the decision into enforcement, because the
 * refusal now happens somewhere the client cannot skip.
 *
 * ---------------------------------------------------------------------------
 * The ANON key, not the service key
 * ---------------------------------------------------------------------------
 *
 * This is exactly the request the browser used to make, relayed. The anon key is designed to
 * be public and GoTrue applies its own rate limits and its own `shouldCreateUser` behaviour to
 * it. Using `SUPABASE_SERVICE_KEY` here would bypass both, and would turn an unauthenticated
 * endpoint into one backed by a credential that can do anything in the project.
 *
 * ---------------------------------------------------------------------------
 * The caller does not learn whether it worked, and that is deliberate
 * ---------------------------------------------------------------------------
 *
 * This returns nothing. `signInWithOtp` succeeds or fails partly on whether the address is
 * known, so relaying that answer would rebuild the account-existence oracle that
 * `/auth/resolve-login` is carefully shaped to avoid. Failures are logged, never returned.
 */
export interface MagicLinkDeps {
  env: Env
  log?: Logger
  /** Injectable so the route can be tested without a network. */
  fetchImpl?: typeof fetch
}

export async function sendMagicLink(
  { env, log, fetchImpl = fetch }: MagicLinkDeps,
  email: string,
  redirectTo: string,
): Promise<void> {
  const base = env.SUPABASE_URL?.replace(/\/+$/, '')
  const key = env.SUPABASE_ANON_KEY
  if (!base || !key) {
    // Local development with `AUTH_PROVIDER=local` has no Supabase at all. Nothing to send,
    // and nothing wrong — the local provider's token prompt is the sign-in there.
    log?.debug('magic link: no Supabase configured, nothing sent')
    return
  }

  try {
    const res = await fetchImpl(`${base}/auth/v1/otp`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      // `create_user` is left at GoTrue's default rather than forced. Forcing `false` would
      // make the response differ for a known and an unknown address — an oracle one layer
      // down from the one we are protecting — and forcing `true` would change who can
      // self-register, which is a product decision and not this refactor's to make.
      body: JSON.stringify({ email, options: { email_redirect_to: redirectTo } }),
    })
    if (!res.ok) {
      // Logged with the STATUS only. The body can echo the address, and this line goes to the
      // same log as everything else.
      log?.warn('magic link: GoTrue refused', { status: res.status })
    }
  } catch (err) {
    log?.warn('magic link: could not reach GoTrue', { message: (err as Error).message })
  }
}
