'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { CheckIcon } from '@/components/icons'
import type { BrandId } from '@/data/brands'
import { useBrand } from '@/features/schedule/posts-store'
import { loadBrand } from '@/lib/remote'

import { finishMeta, finishTikTok, pickPage, signInReturn, type PageChoice } from './accounts'

const words = (err: unknown) => {
  const text = err instanceof Error && err.message ? err.message : 'That did not work.'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Where Meta and TikTok send the browser back after the sign-in. The code goes to the server with
 * the session. TikTok is then linked; Meta answers with the person's Pages, and the one picked
 * becomes the brand's Facebook Page, with its Instagram account. The page the sign-in started
 * from opens after, on its brand: Connections, or the post being retried. No code comes back when the person declines.
 */
export function AccountReturn({
  platform,
  code,
  state,
}: {
  platform: 'meta' | 'tiktok'
  code: string | null
  state: string | null
}) {
  const router = useRouter()
  const { setBrandId } = useBrand()
  const [error, setError] = React.useState<string | null>(
    code && state ? null : `${platform === 'meta' ? 'Facebook' : 'TikTok'} was not connected.`,
  )
  const [pages, setPages] = React.useState<PageChoice | null>(null)
  const [picked, setPicked] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const sent = React.useRef(false)

  const done = React.useCallback(
    async (brandId: BrandId) => {
      setBrandId(brandId)
      // The brand's state names the new account before the page shows it.
      await loadBrand(brandId).catch(() => undefined)
      router.replace(signInReturn())
    },
    [router, setBrandId],
  )

  React.useEffect(() => {
    // Once only: a code works one time, and React runs effects twice in development.
    if (!code || !state || sent.current) return
    sent.current = true
    if (platform === 'tiktok') {
      finishTikTok(code, state).then(
        ({ brandId }) => done(brandId),
        (err) => setError(words(err)),
      )
    } else {
      finishMeta(code, state).then(
        (choice) => {
          setPages(choice)
          // One Page: nothing to pick.
          if (choice.pages.length === 1) setPicked(choice.pages[0]!.id)
        },
        (err) => setError(words(err)),
      )
    }
  }, [code, state, platform, done])

  async function keep() {
    if (!pages || !picked || busy) return
    setBusy(true)
    setError(null)
    try {
      const kept = await pickPage(pages.choice, picked)
      await done(kept.brandId)
    } catch (err) {
      setError(words(err))
      setBusy(false)
    }
  }

  if (error) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[14px] text-ink-2">{error}</p>
        <Link href="/brand/connections" className="text-[13px] font-medium underline">
          Back to Connections
        </Link>
      </main>
    )
  }

  if (!pages) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4">
        <p className="text-[14px] text-ink-4">
          Connecting {platform === 'meta' ? 'Facebook' : 'TikTok'}…
        </p>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="flex w-full max-w-[380px] flex-col gap-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Which Page posts?</h1>
        <div role="radiogroup" aria-label="Pages" className="flex flex-col">
          {pages.pages.map((p) => {
            const on = picked === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(p.id)}
                className="flex items-center gap-3 border-t border-line py-3 text-left first:border-t-0"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-[14px] font-medium">{p.name}</span>
                  <span className="text-[12.5px] text-ink-4">
                    {p.igUsername ? `Instagram @${p.igUsername}` : 'No Instagram account'}
                  </span>
                </span>
                {on && <CheckIcon size={13} />}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => void keep()}
          disabled={!picked || busy}
          className="bb-press h-11 rounded-full bg-ink text-[14px] font-medium text-page hover:opacity-85 disabled:opacity-40"
        >
          {busy ? 'Connecting…' : 'Connect this Page'}
        </button>
      </div>
    </main>
  )
}
