'use client'

import Link from 'next/link'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import type { Format } from '@/data/demo'
import { insightsUrl } from '@/features/insights/views'
import type { Platform } from '@/features/posted/model'
import { useBrand } from '@/features/schedule/posts-store'

import { Composer, leaving } from './composer'

/**
 * Scheduling on its own page, the core of the product: a post opened from the calendar, the shoot
 * brief or Ideate (`/post/<id>`), or a new one (`/post/new`, optionally with the day, hour and
 * format it came from). Back returns to the calendar where it was, or to the feed on the
 * platform it was opened from (`posted`).
 *
 * The page belongs to the brand in the header. A post of another brand is not shown, and
 * switching brand starts the composer over, so nothing is ever saved into the wrong brand.
 */
export function PostPage({
  id,
  start,
  posted,
}: {
  id?: string
  start?: { day?: string; time?: string; format?: Format }
  posted?: Platform
}) {
  const { brand, posts, byId } = useBrand()
  // Past posts (an earlier month) and posts planned from an idea carry the brand's id in theirs,
  // so one taken back to an idea still reads as this brand's, gone from the demo.
  const mine = id ? posts.some((p) => p.id === id) || id.startsWith(`${brand.id}-`) : true
  const post = id && mine ? byId(id) : undefined
  // A post deleted from this page is forgotten once the page goes.
  React.useEffect(
    () => () => {
      if (id) leaving.delete(id)
    },
    [id],
  )
  return (
    <div className="flex min-h-svh flex-col bg-surface-2 max-md:bg-page">
      {/* A post is a task: on a phone it is one white screen, with a back link and no header. */}
      {/* The wrapper is the header's height, so it is the one that stays at the top. */}
      <div className="max-md:hidden md:sticky md:top-0 md:z-40">
        <AppHeader section={posted ? '/feed' : undefined} tinted />
      </div>
      <main className="mx-auto w-full max-w-[1280px] px-10 pb-24 max-md:px-4 max-md:pt-4 max-md:pb-[calc(140px+env(safe-area-inset-bottom))]">
        <div className="pb-5 max-md:pb-4">
          <Link
            href={posted ? insightsUrl('feed', posted) : '/'}
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M9.5 6h-7M5.5 3l-3 3 3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {posted ? 'Feed' : 'Schedule'}
          </Link>
        </div>
        {id && !post && leaving.has(id) ? null : id && !post ? (
          <p className="text-[15px] text-ink-3">
            {mine
              ? 'This post is not in the demo any more. A reload starts the demo over.'
              : `This post belongs to another brand, not ${brand.name}.`}
          </p>
        ) : (
          <Composer
            key={`${brand.id}-${post?.id ?? 'new'}`}
            post={post}
            start={start}
            posted={posted}
          />
        )}
      </main>
    </div>
  )
}
