'use client'

import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'

import {
  accountEmpty,
  loadAll,
  noAccess,
  onProblem,
  remote,
  settled,
  signedIn,
  signOut,
} from '@/lib/remote'

import { NoCompany } from './no-company'

/**
 * With the server on: the team's pages wait for the brands to load, a visit without a session
 * goes to sign-in, a signed-in person the core knows in no company sees that one page, and the
 * data reloads when the tab comes back into view. A refused change shows a short line at the
 * bottom. The static demo, the guest share page and the sign-in and sign-up pages pass straight
 * through.
 */
export function RemoteSync({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const open = !remote || pathname.startsWith('/share') || pathname.startsWith('/sign-')
  const [state, setState] = React.useState<'loading' | 'ready' | 'waiting'>('loading')
  const [problem, setProblem] = React.useState<string | null>(null)

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
    // Loaded: the app, or the waiting page for an account with no brand and no company yet.
    loadAll().then(
      () => setState(accountEmpty() ? 'waiting' : 'ready'),
      (err: unknown) => {
        if (noAccess(err)) setState('waiting')
        else router.replace('/sign-in')
      },
    )
  }, [open, state, router])

  // Back to the tab: what others changed meanwhile comes in, after this tab's own changes land.
  // A person who was waiting and has been added since comes through to the app.
  React.useEffect(() => {
    if (open || state === 'loading') return
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

  function leave() {
    signOut()
    setState('loading')
    router.replace('/sign-in')
  }

  return (
    <>
      {open || state === 'ready' ? (
        children
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
