'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { useBrand } from '@/features/schedule/posts-store'
import { loadBrand } from '@/lib/remote'

import { forgetLiveBoard } from './ideas-store'
import { finishPinterest } from './pinterest'

/**
 * Where Pinterest sends the browser back after the sign-in. The code goes to the server with the
 * session, then the moodboard of the brand it started from opens, ready to pick that brand's board.
 * Pinterest sends no code when the person declines.
 */
export function PinterestReturn({ code, state }: { code: string | null; state: string | null }) {
  const router = useRouter()
  const { setBrandId } = useBrand()
  const [error, setError] = React.useState<string | null>(
    code && state ? null : 'Pinterest was not connected.',
  )
  const sent = React.useRef(false)

  React.useEffect(() => {
    // Once only: a code works one time, and React runs effects twice in development.
    if (!code || !state || sent.current) return
    sent.current = true
    finishPinterest(code, state)
      .then(async ({ brandId }) => {
        // The brand reloads with its new account, and reads its board afresh once one is picked.
        forgetLiveBoard(brandId)
        await loadBrand(brandId)
        return brandId
      })
      .then(
        (brandId) => {
          setBrandId(brandId)
          // The moodboard opens on the Pinterest setup, ready to pick the board.
          router.replace('/ideate?setup=pinterest')
        },
        (err: unknown) => {
          const text = err instanceof Error && err.message ? err.message : 'That did not work.'
          setError(text.charAt(0).toUpperCase() + text.slice(1))
        },
      )
  }, [code, state, router, setBrandId])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      {error ? (
        <>
          <p className="text-[14px] text-ink-2">{error}</p>
          <Link href="/ideate" className="text-[13px] font-medium underline">
            Back to the moodboard
          </Link>
        </>
      ) : (
        <p className="text-[14px] text-ink-4">Connecting Pinterest…</p>
      )}
    </main>
  )
}
