'use client'

import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { onUser, saveName, setPassword } from '@/lib/remote'

import { problem, refusal } from './password'

const FIELD =
  'h-11 w-full rounded-[10px] border border-line bg-page px-3 text-[16px] outline-none focus:border-ink-3'
const LABEL = 'text-[12.5px] text-ink-4'
const BUTTON =
  'bb-press mt-1 h-11 rounded-full bg-ink text-[14px] font-medium text-page disabled:opacity-50'

/** How long the check mark stays after a password change, as on the first sign-in. */
const SHOWN_MS = 1300

/**
 * The signed-in person's own profile (`/profile`, on the core): their name, saved on their
 * Supabase account, their email to read, and a new password. The core's users table keeps the
 * name an admin gave; the header shows this one first.
 */
export function ProfilePage() {
  const [email, setEmail] = React.useState('')
  const [first, setFirst] = React.useState('')
  const [last, setLast] = React.useState('')
  const [saved, setSaved] = React.useState(true)
  const [justSaved, setJustSaved] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [savingName, setSavingName] = React.useState(false)

  const [password, setWord] = React.useState('')
  const [again, setAgain] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)

  // The form fills once, from the account as it loaded.
  const filled = React.useRef(false)
  React.useEffect(
    () =>
      onUser((user) => {
        if (filled.current) return
        filled.current = true
        const [head = '', ...rest] = user.name.trim().split(/\s+/)
        setFirst(head)
        setLast(rest.join(' '))
        setEmail(user.email)
      }),
    [],
  )

  const editName = (put: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    put(e.target.value)
    setSaved(false)
    setJustSaved(false)
    setNameError(null)
  }
  const editWord = (put: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    put(e.target.value)
    setError(null)
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault()
    setSavingName(true)
    try {
      await saveName([first.trim(), last.trim()].filter(Boolean).join(' '))
      setSaved(true)
      setJustSaved(true)
    } catch (err) {
      setNameError(err instanceof Error && err.message ? err.message : 'The name was not saved.')
    }
    setSavingName(false)
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    const words = problem({ password, again })
    if (words) {
      setError(words)
      return
    }
    setBusy(true)
    try {
      await setPassword(password)
      setWord('')
      setAgain('')
      setDone(true)
    } catch (err) {
      setError(refusal(err))
    }
    setBusy(false)
  }

  // The check mark has its moment, then the button comes back.
  React.useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), SHOWN_MS)
    return () => clearTimeout(t)
  }, [done])

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[360px] flex-col gap-10 px-4 pt-10 pb-24 max-md:pt-4">
        <form onSubmit={submitName} noValidate className="flex flex-col gap-3">
          <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.02em]">Profile</h1>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>First name</span>
            <input
              value={first}
              onChange={editName(setFirst)}
              autoComplete="given-name"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Last name</span>
            <input
              value={last}
              onChange={editName(setLast)}
              autoComplete="family-name"
              className={FIELD}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>Email</span>
            <span className="text-[15px] text-ink-3">{email}</span>
          </div>
          {nameError && (
            <p role="alert" className="text-[13px] text-red-600">
              {nameError}
            </p>
          )}
          {/* Save shows once the name changes; after it, a quiet word until the next change. */}
          {!saved ? (
            <button type="submit" disabled={savingName} className={BUTTON}>
              {savingName ? 'Saving…' : 'Save'}
            </button>
          ) : (
            justSaved && (
              <p role="status" className="text-[13px] text-ink-4">
                Saved
              </p>
            )
          )}
        </form>

        <form onSubmit={submitPassword} noValidate className="flex flex-col gap-3">
          <h2 className="mb-1 text-[15px] font-semibold">Change password</h2>
          <label className="sr-only" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={editWord(setWord)}
            className={FIELD}
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
            onChange={editWord(setAgain)}
            className={FIELD}
          />
          {error && (
            <p role="alert" className="text-[13px] text-red-600">
              {error}
            </p>
          )}
          {done ? (
            <span className="mt-1 flex h-11 items-center justify-center">
              <span className="bb-ring flex size-9 items-center justify-center rounded-full bg-ink text-page">
                <svg width="16" height="16" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                  <path
                    className="bb-draw"
                    d="M6 13.5L11 18.5L20 8"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span role="status" className="sr-only">
                Password changed
              </span>
            </span>
          ) : (
            <button type="submit" disabled={busy} className={BUTTON}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          )}
        </form>
      </main>
    </div>
  )
}
