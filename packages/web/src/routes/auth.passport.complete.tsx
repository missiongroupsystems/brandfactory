import { useEffect, useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { passportSupabase } from '@/auth/session'
import { useAuthStore } from '@/auth/store'
import { AppLogo } from '@/components/AppLogo'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

/**
 * Where hosted login lands: the server's callback redirects here with the session in a
 * URL **fragment**.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6B.
 *
 * ---------------------------------------------------------------------------
 * A fragment, not a query string, and that is a security property
 * ---------------------------------------------------------------------------
 *
 * A fragment is never sent to a server, so the tokens cannot land in an access log or in
 * a `Referer` header on the way here. It also means only this page can read them, which
 * is why the exchange ends in a redirect rather than the server setting a cookie.
 *
 * The fragment is **stripped from the URL** as soon as it is read, so a reload or a
 * shared link does not carry a live session.
 *
 * ---------------------------------------------------------------------------
 * The session is established on PASSPORT'S client, and nothing else will do
 * ---------------------------------------------------------------------------
 *
 * `setSession` verifies the token against the project its client is bound to. This token
 * was minted by **Passport's** project, so handing it to the app's own client fails —
 * surfacing as a generic "token verification failed" that reads like a bad token rather
 * than a bad client. And the refresh path must later read the same client, or sign-in
 * appears to work and fails on the very next request with nothing in either log to
 * connect the two.
 *
 * Both halves are why `passportSupabase` is defined once, beside `getSession`, and
 * imported here rather than constructed.
 */
function PassportCompletePage() {
  const [error, setError] = useState<string | null>(null)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  useEffect(() => {
    const finish = async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = fragment.get('access_token')
      const refreshToken = fragment.get('refresh_token')

      // Drop the tokens out of the URL before anything else can read or log them.
      window.history.replaceState({}, '', window.location.pathname)

      if (!accessToken || !refreshToken) {
        setError('That sign-in link is incomplete. Please try again.')
        return
      }

      if (!passportSupabase) {
        // Reachable only if the server has hosted login configured and this bundle does
        // not — a half-configured deployment. Say so rather than failing opaquely: the
        // person cannot fix it and the operator can.
        setError('Single sign-on is not configured in this build. Please contact support.')
        return
      }

      const { error: setErr } = await passportSupabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (setErr) {
        setError(`Could not establish the session: ${setErr.message}`)
        return
      }

      // Resolve who this is through OUR API, exactly as the app-native branch does — the
      // same `/me` call, so both branches converge on one identity source rather than
      // trusting a claim from the token.
      try {
        const res = await fetch(`${API_BASE}/me`, {
          headers: { authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          setError(`Sign-in failed (${res.status}): ${body || res.statusText}`)
          return
        }
        const me = (await res.json()) as { id: string }
        // `'passport'` is the load-bearing argument: it is what makes every later
        // refresh and the sign-out use the client that actually holds this session.
        setAuth(accessToken, me.id, 'passport')
        // `/`, not `/workspaces`: the landing route resolves which workspace to open.
        await navigate({ to: '/' })
      } catch (err) {
        setError(`Sign-in network error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    void finish()
  }, [setAuth, navigate])

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <AppLogo />
        {error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <a className="text-sm underline" href="/login">
              Back to sign in
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        )}
      </div>
    </div>
  )
}

export const passportCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/passport/complete',
  // Deliberately NO `beforeLoad` token guard. The other routes redirect a signed-in
  // visitor away, but this page's whole job is to CREATE the session — and a stale token
  // left over from a previous session would otherwise bounce the person to `/` before
  // the new one is established.
  component: PassportCompletePage,
})
