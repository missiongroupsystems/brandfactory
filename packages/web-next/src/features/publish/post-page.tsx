'use client'

import Link from 'next/link'

import { AppHeader } from '@/components/app-header'
import { useBrand } from '@/features/schedule/posts-store'

import { Composer } from './composer'

/**
 * Scheduling on its own page, the core of the product: a post opened from the calendar, the shoot
 * brief or Ideate (`/post/<id>`), or a new one (`/post/new`, optionally with the day and hour of
 * the slot it came from). Back returns to the calendar where it was.
 *
 * The page belongs to the brand in the header. A post of another brand is not shown, and
 * switching brand starts the composer over, so nothing is ever saved into the wrong brand.
 */
export function PostPage({
  id,
  start,
}: {
  id?: string
  start?: { day?: string; time?: string; format?: 'story' }
}) {
  const { brand, posts, byId } = useBrand()
  // Past posts (an earlier month) carry the brand's id in theirs.
  const mine = id ? posts.some((p) => p.id === id) || id.startsWith(`${brand.id}-archive`) : true
  const post = id && mine ? byId(id) : undefined
  return (
    <div className="flex min-h-svh flex-col bg-surface-2">
      {/* A post is a task: on a phone it fills the screen, with a back link and no header. */}
      <div className="max-md:hidden">
        <AppHeader />
      </div>
      <main className="mx-auto w-full max-w-[1280px] px-10 pb-24 max-md:px-4 max-md:pt-4 max-md:pb-[calc(140px+env(safe-area-inset-bottom))]">
        <div className="pb-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase transition-colors hover:text-ink"
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
            Schedule
          </Link>
        </div>
        {id && !post ? (
          <p className="text-[15px] text-ink-3">
            {mine
              ? 'This post is not in the demo any more. A reload starts the demo over.'
              : `This post belongs to another brand, not ${brand.name}.`}
          </p>
        ) : (
          <Composer key={`${brand.id}-${post?.id ?? 'new'}`} post={post} start={start} />
        )}
      </main>
    </div>
  )
}
