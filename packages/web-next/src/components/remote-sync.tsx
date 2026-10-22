'use client'

import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'

import {
  accountEmpty,
  loadAll,
  needsPassword,
  noAccess,
  onProblem,
  remote,
  settled,
  signedIn,
  signOut,
} from '@/lib/remote'

import { NoCompany } from './no-company'
import { SetPassword } from './set-password'

type State = 'loading' | 'password' | 'ready' | 'waiting'

/**
 * With the server on: the team's pages wait for the brands to load, a visit without a session
 * goes to sign-in, a first sign-in sets a password before anything else, a signed-in person the
 * core knows in no company sees that one page, and the data reloads when the tab comes back into
 * view. A refused change shows a short line at the bottom. The static demo, the guest share page
 * and the sign-in page pass straight through.
 */
export function RemoteSync({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const open = !remote || pathname.startsWith('/share') || pathname === '/sign-in'
  const [state, setState] = React.useState<State>('loading')
  const [problem, setProblem] = React.useState<string | null>(null)

  // Back on sign-in (a link, the address bar), whoever signs in next loads afresh: nothing of the
  // last account's state, screen or password step carries over.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setState('loading')
  }

  React.useEffect(() => onProblem(setProblem), [])
  React.useEffect(() => {
    if (!problem) return
    const t = setTimeout(() => setProblem(null), 5000)
    return () => clearTimeout(t)
  }, [problem])

  React.useEffect(() => {
    if (open || state !== 'loading') return
    if (!signedIn()) {
      router.replace('/sign-in')
      return
    }
    // A first sign-in sets a password first. Loaded: the app, or the waiting page for an
    // account with no brand and no company yet.
    const next: Promise<State> = needsPassword()
      ? Promise.resolve('password')
      : loadAll().then(() => (accountEmpty() ? 'waiting' : 'ready'))
    next.then(setState, (err: unknown) => {
      if (noAccess(err)) setState('waiting')
      else router.replace('/sign-in')
    })
  }, [open, state, router])

  // Back to the tab: what others changed meanwhile comes in, after this tab's own changes land.
  // A person who was waiting and has been added since comes through to the app.
  React.useEffect(() => {
    if (open || state === 'loading' || state === 'password') return
    const back = () => {
      if (document.visibilityState === 'visible')
        void settled()
          .then(loadAll)
          .then(() => setState(accountEmpty() ? 'waiting' : 'ready'))
          // Taken out of the company meanwhile: the waiting page, not a stale app.
          .catch((err: unknown) => noAccess(err) && setState('waiting'))
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [open, state])

  // The password is set: now the account loads.
  const load = React.useCallback(() => setState('loading'), [])

  function leave() {
    signOut()
    setState('loading')
    router.replace('/sign-in')
  }

  return (
    <>
      {open || state === 'ready' ? (
        children
      ) : state === 'password' ? (
        <SetPassword onDone={load} onSignOut={leave} />
      ) : state === 'waiting' ? (
        <NoCompany onSignOut={leave} />
      ) : null}
      {problem && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-ink px-4 py-2 text-[13px] text-page"
        >
          {problem}
        </div>
      )}
    </>
  )
}
