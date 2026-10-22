'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { problem, refusal } from '@/features/account/sign-up'
import { signUp } from '@/lib/remote'

const FIELD =
  'h-11 w-full rounded-[10px] border border-line bg-page px-3 text-[16px] outline-none focus:border-ink-3'
const QUIET = 'mt-3 self-center text-[13px] text-ink-4 transition-colors hover:text-ink'

/**
 * One screen, one action: a name, a work email and a password, then "check your email". The
 * confirm link in that email lands on /sign-up/done, signed in.
 */
export function SignUp() {
  const router = useRouter()
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  const edit = (set: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const words = problem({ name, email, password })
    if (words) {
      setError(words)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const outcome = await signUp(name.trim(), email.trim(), password)
      // A project that does not ask for a confirmation answers with a session: straight in.
      if (outcome === 'in') router.replace('/')
      else setSent(true)
    } catch (err) {
      setError(refusal(err))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4">
        <div className="bb-rise flex w-full max-w-[320px] flex-col gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Check your email</h1>
          <p className="text-[15px] leading-[1.5] text-ink-2">
            We sent a link to <span className="text-ink">{email.trim()}</span>. Open it to finish.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-3 self-start text-[13px] text-ink-4 transition-colors hover:text-ink"
          >
            Use another email
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <form onSubmit={submit} noValidate className="flex w-full max-w-[320px] flex-col gap-3">
        <h1 className="mb-3 text-[22px] font-semibold tracking-[-0.02em]">brand base</h1>
        <label className="sr-only" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Name"
          value={name}
          onChange={edit(setName)}
          className={FIELD}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the form is the whole page
          autoFocus
        />
        <label className="sr-only" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="Work email"
          value={email}
          onChange={edit(setEmail)}
          className={FIELD}
        />
        <label className="sr-only" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="Password"
          value={password}
          onChange={edit(setPassword)}
          className={FIELD}
        />
        {error && (
          <p role="alert" className="text-[13px] text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="bb-press mt-2 h-11 rounded-full bg-ink text-[14px] font-medium text-page disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <Link href="/sign-in" className={QUIET}>
          Have an account? Sign in
        </Link>
      </form>
    </main>
  )
}
