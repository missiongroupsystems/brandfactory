'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { CONTACT } from '@/components/legal'
import type { BrandId } from '@/data/brands'
import { useBrand } from '@/features/schedule/posts-store'

import { finishMeta, type MetaPage, pickPage } from './make'

type Found = { brandId: BrandId; choice: string; pages: MetaPage[] }

/**
 * Where Facebook's sign-in sends the browser back. The code goes to the server with the session,
 * which answers with the person's Pages. One Page links at once; with several, the person picks the
 * brand's. The Page's Instagram account comes with it. Then Connections opens on that brand. A
 * declined or failed sign-in shows Facebook's reason here.
 */
export function MetaReturn({
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
    code && state && !declined
      ? null
      : `Facebook was not connected.${declined ? ` ${declined.slice(0, 200)}` : ''}`,
  )
  const [found, setFound] = React.useState<Found | null>(null)
  const [picking, setPicking] = React.useState(false)
  const sent = React.useRef(false)

  const fail = React.useCallback((err: unknown) => {
    const text = err instanceof Error && err.message ? err.message : 'That did not work.'
    setError(text.charAt(0).toUpperCase() + text.slice(1))
  }, [])

  const pick = React.useCallback(
    (got: Found, pageId: string) => {
      setPicking(true)
      pickPage(got.brandId, got.choice, pageId).then(({ webhooks }) => {
        setBrandId(got.brandId)
        if (webhooks === false) {
          setError(
            `Facebook is connected and can post, but its comments and DMs will not reach the Inbox yet. Write to ${CONTACT} to turn them on.`,
          )
        } else router.replace('/brand/connections')
      }, fail)
    },
    [fail, router, setBrandId],
  )

  React.useEffect(() => {
    // Once only: a code works one time, and React runs effects twice in development.
    if (!code || !state || declined || sent.current) return
    sent.current = true
    finishMeta(code, state).then((got) => {
      if (got.pages.length === 1) pick(got, got.pages[0]!.id)
      else setFound(got)
    }, fail)
  }, [code, state, declined, fail, pick])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      {error ? (
        <>
          <p className="max-w-[420px] text-[14px] text-ink-2">{error}</p>
          <Link href="/brand/connections" className="text-[13px] font-medium underline">
            Back to Connections
          </Link>
        </>
      ) : found && !picking ? (
        <>
          <p className="text-[14px] text-ink-2">Which Page is this brand’s?</p>
          <ul className="flex w-full max-w-[360px] flex-col rounded-[18px] bg-page shadow-[0_0_0_1px_var(--line)]">
            {found.pages.map((p) => (
              <li key={p.id} className="border-t border-line first:border-t-0">
                <button
                  type="button"
                  onClick={() => pick(found, p.id)}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-surface"
                >
                  <span className="text-[14.5px] font-medium">{p.name}</span>
                  <span className="text-[12.5px] text-ink-4">
                    {p.igUsername ? `Instagram @${p.igUsername}` : 'No Instagram account'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[14px] text-ink-4">Connecting Facebook…</p>
      )}
    </main>
  )
}
