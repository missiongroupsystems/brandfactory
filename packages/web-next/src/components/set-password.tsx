'use client'

import * as React from 'react'

import { problem, refusal } from '@/features/account/password'
import { setPassword } from '@/lib/remote'

const FIELD =
  'h-11 w-full rounded-[10px] border border-line bg-page px-3 text-[16px] outline-none focus:border-ink-3'

/** How long the check mark stays: the ring rises, the tick draws, the whole fades. */
const SHOWN_MS = 1300
/** With motion reduced the check shows at once and holds, with no fade. */
const SHOWN_STILL_MS = 700
const REDUCE = '(prefers-reduced-motion: reduce)'

/**
 * The first sign-in: a password of the person's own, then one drawn check mark, then the app.
 * An admin made the account with a password they chose; nothing of it stays past this screen.
 */
export function SetPassword({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [password, setWord] = React.useState('')
  const [again, setAgain] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Once set: how the check mark shows, read when it is about to.
  const [shown, setShown] = React.useState<'moving' | 'still' | null>(null)

  const edit = (put: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    put(e.target.value)
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const words = problem({ password, again })
    if (words) {
      setError(words)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setPassword(password)
      setShown(window.matchMedia(REDUCE).matches ? 'still' : 'moving')
    } catch (err) {
      setError(refusal(err))
      setBusy(false)
    }
  }

  // The check mark has its moment, then the app.
  React.useEffect(() => {
    if (!shown) return
    const t = setTimeout(onDone, shown === 'still' ? SHOWN_STILL_MS : SHOWN_MS)
    return () => clearTimeout(t)
  }, [shown, onDone])

  if (shown) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4">
        <div
          className={`flex flex-col items-center ${shown === 'moving' ? 'bb-fade-out' : ''}`}
          style={{ animationDelay: '950ms', animationDuration: '350ms' }}
        >
          <span className="bb-ring flex size-16 items-center justify-center rounded-full bg-ink text-page">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
              <path
                className="bb-draw"
                d="M6 13.5L11 18.5L20 8"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span role="status" className="sr-only">
            Password set
          </span>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <form onSubmit={submit} noValidate className="flex w-full max-w-[320px] flex-col gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Set your password</h1>
        <p className="mb-1 text-[14px] leading-[1.5] text-ink-3">
          First time here: choose one of your own.
        </p>
        <label className="sr-only" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="New password"
          value={password}
          onChange={edit(setWord)}
          className={FIELD}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the form is the whole page
          autoFocus
        />
        <label className="sr-only" htmlFor="again">
          New password again
        </label>
        <input
          id="again"
          type="password"
          autoComplete="new-password"
          placeholder="Again"
          value={again}
          onChange={edit(setAgain)}
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
          {busy ? 'Saving…' : 'Set password'}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-3 self-center text-[13px] text-ink-4 transition-colors hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </main>
  )
}
