'use client'

import Link from 'next/link'
import * as React from 'react'

import { passwordSignIn, RemoteError, signIn } from '@/lib/remote'

import { LogoMark } from './icons'
import { TITLE } from './page-title'

/**
 * A plain sentence for a failed sign-in: the core's own words ("Not Found") mean nothing to a
 * person at the door.
 */
export function signInError(err: unknown): string {
  // Only the sign-in itself refusing the details says so. Any other answer, a 401, 403 or 404
  // from the core among them, is not a wrong password: its own words go to the console.
  if (err instanceof RemoteError && err.code === 'SIGN_IN')
    return passwordSignIn
      ? 'That email and password did not work.'
      : 'No account with that user id.'
  console.error('sign-in failed:', err instanceof Error ? err.message : err)
  // What to fix, where the failure says it: the connection, or a server that is down.
  if (!(err instanceof RemoteError)) return 'No connection. Check the internet and try again.'
  if (err.status >= 500) return 'brand base is not answering. Try again in a minute.'
  return 'Sign-in did not work. Try again.'
}

/** The dev sign-in's hint shows only in a dev build. */
const DEV = process.env.NODE_ENV === 'development'

/**
 * One screen, one action: an email and a password, then the app. Each field says what it wants
 * above it; the core's dev sign-in (no Supabase) asks for a user id, and a dev build says where to
 * find one.
 */
export function SignIn() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      // A full page load: nothing of an earlier account stays in memory.
      window.location.assign('/')
    } catch (err) {
      setError(signInError(err))
      setBusy(false)
    }
  }

  const LABEL = 'flex flex-col gap-1.5 text-[13px] font-medium text-ink-2'
  const field =
    'h-11 w-full rounded-[10px] border border-line bg-page px-3 text-[16px] font-normal text-ink outline-none focus:border-ink-3'
  return (
    <main className="flex min-h-svh flex-col items-center px-4">
      <form onSubmit={submit} className="my-auto flex w-full max-w-[320px] flex-col gap-3 py-10">
        <span className="text-ink">
          <LogoMark />
        </span>
        <h1 className={`mt-4 mb-5 ${TITLE}`}>Sign in</h1>
        <label htmlFor="email" className={LABEL}>
          {passwordSignIn ? 'Email' : 'User id'}
          <input
            id="email"
            type={passwordSignIn ? 'email' : 'text'}
            autoComplete="username"
            aria-describedby={!passwordSignIn && DEV ? 'email-hint' : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
            required
          />
        </label>
        {!passwordSignIn && DEV && (
          <p id="email-hint" className="-mt-1 text-[13px] text-ink-3">
            Dev sign-in: the id of a user in the core&apos;s database.
          </p>
        )}
        {passwordSignIn && (
          <label htmlFor="password" className={LABEL}>
            Password
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
              required
            />
          </label>
        )}
        {error && <p className="text-[13px] text-fail-ink">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bb-press mt-2 h-11 rounded-full bg-ink text-[14px] font-medium text-page disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {/* In the flow under the form, so a short screen scrolls instead of overlapping. */}
      <footer className="flex justify-center gap-4 pb-[calc(20px+env(safe-area-inset-bottom))] text-[13px] text-ink-3">
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
      </footer>
    </main>
  )
}
