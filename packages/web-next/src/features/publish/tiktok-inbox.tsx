'use client'

import Link from 'next/link'
import * as React from 'react'

import { isVideo } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import type { Post } from '@/data/demo'
import { NotAvailable } from '@/features/connections/not-available'
import {
  follow,
  sendToTikTok,
  tiktokOn,
  useTikTokAccount,
  useTikTokSend,
} from '@/features/connections/tiktok'
import { dayOf } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'
import { report } from '@/lib/remote'

/** The pack refuses a second send of a post while an upload may still run (`post.tiktok_free`). */
const UPLOAD_WINDOW_MS = 30 * 60 * 1000

/** The account's picture from TikTok's CDN, or TikTok's logo when there is none or it expired. */
export function TikTokPicture({ src }: { src: string | null }) {
  const [broken, setBroken] = React.useState<string | null>(null)
  if (!src || broken === src) return <PlatformLogo platform="tt" size={16} />
  return <img src={src} alt="" onError={() => setBroken(src)} className="size-full object-cover" />
}

/**
 * A planned TikTok video, sent to the brand's TikTok inbox as a draft: TikTok tells the account,
 * and the team finishes the post in the TikTok app (sound, text, who can watch). Nothing is posted
 * from here. On the core only, once the server has the TikTok app; a post that is not on TikTok,
 * not on the calendar or posted shows nothing.
 */
export function TikTokInbox({ post }: { post: Post }) {
  const { brand, weeks } = useBrand()
  const account = useTikTokAccount(brand.id)
  const stored = useTikTokSend(brand.id, post.id)
  // An upload the server never finished (it stopped mid-way): the pack lets the post go again
  // after 30 minutes, so it reads as failed from then on. Measured from when the card opened.
  const [openedAt] = React.useState(() => Date.now())
  const send =
    stored?.status === 'uploading' && openedAt - Date.parse(stored.updatedAt) > UPLOAD_WINDOW_MS
      ? {
          ...stored,
          status: 'failed' as const,
          reason: 'The last send did not finish. Send it again.',
        }
      : stored
  const [pressed, setPressed] = React.useState(false)

  // A send TikTok was still processing when the page opened: ask how it stands.
  React.useEffect(() => {
    if (stored?.status === 'processing') void follow(brand.id, stored)
  }, [brand.id, stored])

  const planned = Boolean(dayOf(weeks, post.id))
  if (!tiktokOn() || !post.channels?.includes('tt') || !planned || post.stage === 'posted') {
    return null
  }
  const video = post.format === 'reel' && post.images.length === 1 && isVideo(post.images[0]!)
  const busy = pressed || send?.status === 'uploading' || send?.status === 'processing'

  async function onSend() {
    setPressed(true)
    try {
      await sendToTikTok(brand.id, post.id)
    } catch (err) {
      report(err instanceof Error && err.message ? err.message : 'That did not work.')
    } finally {
      setPressed(false)
    }
  }

  const line = !account
    ? 'Connect the brand’s TikTok to send this video to its inbox.'
    : busy
      ? 'Sending to TikTok…'
      : send?.status === 'sent'
        ? 'Sent to your TikTok inbox. Open TikTok to post it.'
        : send?.status === 'failed'
          ? (send.reason ?? 'TikTok did not take the video. Try again.')
          : `Sends the video to ${account.name}’s TikTok inbox as a draft. Your team finishes the post in the TikTok app.`
  const dot = busy
    ? 'animate-pulse bg-(--pending)'
    : send?.status === 'sent'
      ? 'bg-(--live)'
      : send?.status === 'failed'
        ? 'bg-fail'
        : null

  return (
    <section
      aria-label="TikTok inbox"
      className="flex items-center gap-3.5 rounded-[18px] bg-page px-4 py-3.5 shadow-[0_0_0_1px_var(--line)] max-md:flex-wrap max-md:gap-3 max-md:px-3.5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-surface text-ink">
        <TikTokPicture src={account?.avatar ?? null} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 max-md:basis-[calc(100%-56px)]">
        <span className="text-[14px] font-medium">TikTok inbox</span>
        <span
          aria-live="polite"
          className={`flex items-start gap-1.5 text-[13px] leading-[1.45] ${send?.status === 'failed' && !busy ? 'text-fail-ink' : 'text-ink-3'}`}
        >
          {dot && (
            <span aria-hidden="true" className={`mt-[6px] size-1.5 shrink-0 rounded-full ${dot}`} />
          )}
          {line}
        </span>
      </span>
      {send?.status === 'sent' && !busy && account && video ? (
        <button
          type="button"
          onClick={onSend}
          className="shrink-0 rounded-full px-2 text-[13px] font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline max-md:h-11 max-md:w-full"
        >
          Send again
        </button>
      ) : !account ? (
        <Link
          href="/brand/connections"
          className="bb-press flex h-8 shrink-0 items-center rounded-full bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-paper max-md:h-11 max-md:w-full max-md:justify-center"
        >
          Connect TikTok
        </Link>
      ) : !video ? (
        <NotAvailable label="Needs a video" reason="TikTok takes one uploaded video." />
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={busy}
          className={`bb-press h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-opacity max-md:h-11 max-md:w-full ${busy ? 'cursor-default bg-surface text-ink-4' : 'bg-ink text-page hover:opacity-85'}`}
        >
          {busy ? 'Sending…' : send?.status === 'failed' ? 'Try again' : 'Send to TikTok inbox'}
        </button>
      )}
    </section>
  )
}
