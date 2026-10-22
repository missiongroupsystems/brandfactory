'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { keepSession, readLink } from '@/lib/remote'

// The hash never changes while the page is up: nothing to hear.
const still = () => () => {}

/**
 * Where the confirm link lands. Supabase puts the session in the address's hash: it is kept and
 * the app opens. A used or old link says so and offers a fresh one.
 */
export function SignUpDone() {
  const router = useRouter()
  // The browser's alone: null on the server, read once the page is in a browser.
  const hash = React.useSyncExternalStore(
    still,
    () => window.location.hash,
    () => null,
  )
  const link = React.useMemo(() => (hash === null ? null : readLink(hash)), [hash])

  React.useEffect(() => {
    if (link && 'session' in link) {
      keepSession(link.session)
      router.replace('/')
    }
  }, [link, router])

  if (!link || !('trouble' in link)) return null
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="bb-rise flex w-full max-w-[320px] flex-col gap-3">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{link.trouble}</h1>
        <p className="text-[15px] leading-[1.5] text-ink-2">Sign up again to get a new one.</p>
        <Link
          href="/sign-up"
          className="bb-press mt-3 flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-medium text-page"
        >
          Sign up
        </Link>
      </div>
    </main>
  )
}
