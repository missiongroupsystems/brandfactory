import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/auth/store'
import { supabase } from '@/auth/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginErrorMessage, passportStartUrl, resolveLoginRoute } from '@/auth/resolveLogin'

// The client is imported, not constructed here. Two clients over one
// localStorage session is two refresh schedulers racing each other, and the
// one that used to live in this file was unreachable from the signed-in app —
// which is precisely how the access token was left to expire in place.
// Null when the env vars are absent (dev without Supabase).
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

interface MeResponse {
  id: string
}

function readInitialUrlError(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)

  // OUR OWN codes first. Both namespaces land in the same `?error=` parameter, and the
  // generic reader below also matches a bare `error` — so checking it first would show
  // somebody the literal string `no_access`. Order is the whole fix.
  const ours = loginErrorMessage(url.searchParams.get('error'))
  if (ours) return ours

  const queryErr = url.searchParams.get('error_description') ?? url.searchParams.get('error')
  const hash = new URLSearchParams(url.hash.slice(1))
  const hashErr = hash.get('error_description') ?? hash.get('error')
  const raw = queryErr ?? hashErr
  return raw ? decodeURIComponent(raw.replace(/\+/g, ' ')) : null
}

export function SupabaseAuthProvider() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(() => readInitialUrlError())
  // Step 1 collects an email and nothing else; step 2 is whatever that email routes to.
  // `routing` is the round trip in between.
  //
  // **An error in the URL starts on step 2, and that is not cosmetic.** An error here
  // always means a sign-in attempt just failed. Starting such a visitor on step 1 gives
  // them one control, Continue, which routes the same address back to the branch that just
  // failed — an infinite bounce for `no_access` and `passport_sso_failed`, since neither
  // clears by retrying. It also makes the copy lie: two of the messages say "sign in with
  // a magic link below" and on step 1 there is no magic link below.
  //
  // True for Supabase's own error codes as well, for the same reason: they arrive from the
  // app-native branch, which is where this lands.
  const [step, setStep] = useState<'email' | 'app-native'>(() =>
    readInitialUrlError() ? 'app-native' : 'email',
  )
  const [routing, setRouting] = useState(false)
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) return

    const finishSignIn = async (token: string) => {
      try {
        const res = await fetch(`${API_BASE}/me`, {
          headers: { authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          setError(`Sign-in failed (${res.status}): ${body || res.statusText}`)
          return
        }
        const data = (await res.json()) as MeResponse
        // `'app-native'` stated, not defaulted: this is a sign-in, and a sign-in is the
        // only thing that may decide the issuer. See `setAuth` in `../store`.
        setAuth(token, data.id, 'app-native')
        // `/`, not `/workspaces`: the landing route resolves which workspace
        // to open (route → last-used-if-still-valid → oldest → first-run).
        await navigate({ to: '/' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Sign-in network error: ${msg}`)
      }
    }

    const code = new URL(window.location.href).searchParams.get('code')

    if (code) {
      // Manual exchange so we can show the actual error instead of letting
      // supabase-js log silently. Strip `?code=` from the URL on success so
      // a refresh doesn't try to re-exchange.
      void supabase.auth.exchangeCodeForSession(code).then(({ data, error: exErr }) => {
        if (exErr) {
          setError(`Magic-link exchange failed: ${exErr.message}`)
          return
        }
        window.history.replaceState({}, '', window.location.pathname)
        if (data.session?.access_token) {
          void finishSignIn(data.session.access_token)
        }
      })
    } else {
      // No code in URL — check if a session is already present (e.g. user
      // refreshed after a successful exchange in another tab).
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.access_token) void finishSignIn(data.session.access_token)
      })
    }
  }, [setAuth, navigate])

  if (!supabase) {
    return (
      <p className="text-sm text-destructive">
        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for Supabase auth.
      </p>
    )
  }
  // Re-bound to a local const: TypeScript doesn't carry the null-narrowing of
  // an *imported* binding into a nested closure, since another module could in
  // principle reassign it. The guard above is the real check.
  const client = supabase

  if (sent) {
    return (
      <div className="w-full space-y-1 text-center">
        <p className="font-medium">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a magic link to <strong>{email}</strong>.
        </p>
      </div>
    )
  }

  const handleGoogle = async () => {
    setError(null)
    // signInWithOAuth redirects the tab to Google, then back to `/login` with
    // `?code=`, which the mount effect above exchanges — the same path the
    // magic link uses. No email, so it sidesteps the SMTP flow entirely.
    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    })
    if (oauthError) setError(oauthError.message)
  }

  /**
   * Step 1 — ONE field, then the app decides.
   *
   * A member is sent to Passport's hosted login and never sees a password step here;
   * everyone else gets step 2 revealed in place, with no page transition.
   *
   * **The user is never asked which kind of account they have.** No "sign in with SSO"
   * button, no toggle: that choice is the thing this screen exists to remove, because
   * most people do not know the answer.
   */
  const handleContinue = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setRouting(true)
    try {
      const route = await resolveLoginRoute(email.trim())
      if (route === 'passport') {
        // A FULL-PAGE navigation, not a fetch: the browser has to follow the redirect
        // chain to Passport and back, and the PKCE verifier never leaves the server.
        window.location.assign(passportStartUrl())
        return
      }
      setStep('app-native')
    } finally {
      setRouting(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: signInError } = await client.auth.signInWithOtp({
        email: email.trim(),
        // Land on /login so SupabaseAuthProvider mounts and processes the
        // ?code= query. Returning to `/` lets indexRoute.beforeLoad redirect
        // before the auth code is exchanged, stripping the query.
        options: { emailRedirectTo: `${window.location.origin}/login` },
      })
      if (signInError) {
        setError(signInError.message)
      } else {
        setSent(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Step 1 ───────────────────────────────────────────────────────────────
  if (step === 'email') {
    return (
      <div className="w-full space-y-5">
        <form onSubmit={(e) => void handleContinue(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={routing || !email.trim()}>
            {routing ? 'Checking…' : 'Continue'}
          </Button>
        </form>
      </div>
    )
  }

  // ── Step 2, the app-native branch ────────────────────────────────────────
  //
  // **This branch stays forever.** It is what a non-member uses, and it is what the
  // screen degrades to when Passport is unreachable — the property that makes depending
  // on the hosted handoff safe at all. Deleting it once SSO works would make Passport a
  // hard availability dependency for signing in, with no way back if the OAuth
  // configuration is wrong.
  return (
    <div className="w-full space-y-5">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/*
          The SAME email field, still editable, rather than the address echoed back with a
          "Change" link. Two reasons, and the second is the load-bearing one:

          - a typo is the most common failure on this screen, and an editable field fixes it
            in place, with no extra control to find;
          - a visitor who arrives on an `?error=` starts HERE with no email at all. An echo
            would render an empty line above a disabled button, with nothing to type into.
        */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
          {loading ? 'Sending…' : 'Send magic link'}
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          or continue with
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={() => void handleGoogle()}
      >
        <GoogleIcon className="h-4 w-4" />
        Sign in with Google
      </Button>
    </div>
  )
}

// The four-colour Google "G", inlined so it needs no asset and no runtime fetch
// (the CSP on the artifact host and the offline dev proxy both forbid remote
// images). Standard Google identity mark.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
