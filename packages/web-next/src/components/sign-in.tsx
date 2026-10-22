'use client'

import * as React from 'react'

import { passwordSignIn, signIn } from '@/lib/remote'

/** One screen, one action: an email and a password, then the app. */
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
      setError(err instanceof Error ? err.message : 'That did not work.')
      setBusy(false)
    }
  }

  const field =
    'h-11 w-full rounded-[10px] border border-line bg-page px-3 text-[16px] outline-none focus:border-ink-3'
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <form onSubmit={submit} className="flex w-full max-w-[320px] flex-col gap-3">
        <h1 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">brand base</h1>
        <label className="sr-only" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type={passwordSignIn ? 'email' : 'text'}
          autoComplete="username"
          placeholder={passwordSignIn ? 'Email' : 'User id'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          required
        />
        {passwordSignIn && (
          <>
            <label className="sr-only" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
              required
            />
          </>
        )}
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bb-press mt-2 h-11 rounded-full bg-ink text-[14px] font-medium text-page disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
