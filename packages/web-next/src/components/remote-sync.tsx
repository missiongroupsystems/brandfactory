'use client'

import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'

import { loadAll, onProblem, remote, settled, signedIn } from '@/lib/remote'

/**
 * With the server on: the team's pages wait for the brands to load, a visit without a session
 * goes to sign-in, and the data reloads when the tab comes back into view. A refused change shows
 * a short line at the bottom. The static demo and the guest share page pass straight through.
 */
export function RemoteSync({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const open = !remote || pathname.startsWith('/share') || pathname === '/sign-in'
  const [ready, setReady] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  React.useEffect(() => onProblem(setProblem), [])
  React.useEffect(() => {
    if (!problem) return
    const t = setTimeout(() => setProblem(null), 5000)
    return () => clearTimeout(t)
  }, [problem])

  React.useEffect(() => {
    if (open || ready) return
    if (!signedIn()) {
      router.replace('/sign-in')
      return
    }
    loadAll().then(
      () => setReady(true),
      () => router.replace('/sign-in'),
    )
  }, [open, ready, router])

  // Back to the tab: what others changed meanwhile comes in, after this tab's own changes land.
  React.useEffect(() => {
    if (open || !ready) return
    const back = () => {
      if (document.visibilityState === 'visible')
        void settled()
          .then(loadAll)
          .catch(() => {})
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [open, ready])

  return (
    <>
      {open || ready ? children : null}
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
