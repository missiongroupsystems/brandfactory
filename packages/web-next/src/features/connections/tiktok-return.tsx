'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { useBrand } from '@/features/schedule/posts-store'
import { loadBrand } from '@/lib/remote'

import { finishTikTok } from './tiktok'

/**
 * TikTok's own reason, in one short line. `access_denied` is the person's own No; any other code
 * shows as TikTok sent it (in TikTok's Sandbox, only its test accounts may sign in).
 */
function reasonOf(declined: string | null): string {
  if (!declined) return ''
  if (declined === 'access_denied') return ' Access was not allowed on TikTok.'
  return ` TikTok said: ${declined.slice(0, 200)}`
}

/**
 * Where TikTok sends the browser back after its sign-in. The code goes to the server with the
 * session, then Connections opens on the brand it started from, with the account linked. TikTok
 * sends no code when the person declines, or when the account cannot use the app (in TikTok's
 * Sandbox only its test accounts can); its reason shows here.
 */
export function TikTokReturn({
  code,
  state,
  declined,
}: {
  code: string | null
  state: string | null
  declined: string | null
}) {
  const router = useRouter()
  const { setBrandId } = useBrand()
  const [error, setError] = React.useState<string | null>(
    code && state && !declined ? null : `TikTok was not connected.${reasonOf(declined)}`,
  )
  const sent = React.useRef(false)

  React.useEffect(() => {
    // Once only: a code works one time, and React runs effects twice in development.
    if (!code || !state || declined || sent.current) return
    sent.current = true
    finishTikTok(code, state)
      .then(async ({ brandId }) => {
        // Linked already: a brand that does not reload now shows the account on the next load.
        await loadBrand(brandId).catch(() => undefined)
        return brandId
      })
      .then(
        (brandId) => {
          setBrandId(brandId)
          router.replace('/brand/connections')
        },
        (err: unknown) => {
          const text = err instanceof Error && err.message ? err.message : 'That did not work.'
          setError(text.charAt(0).toUpperCase() + text.slice(1))
        },
      )
  }, [code, state, declined, router, setBrandId])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      {error ? (
        <>
          <p className="max-w-[420px] text-[14px] text-ink-2">{error}</p>
          <Link href="/brand/connections" className="text-[13px] font-medium underline">
            Back to Connections
          </Link>
        </>
      ) : (
        <p className="text-[14px] text-ink-4">Connecting TikTok…</p>
      )}
    </main>
  )
}
