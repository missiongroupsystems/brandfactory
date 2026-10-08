'use client'

import type { Post } from '@/data/demo'

import { ALL_STAGES, type StageFilter } from './calendar-items'

/** Only the failed stage: what the pill switches the calendar to. */
export const ONLY_FAILED = Object.fromEntries(
  Object.keys(ALL_STAGES).map((k) => [k, k === 'failed']),
) as StageFilter

export function onlyFailed(stages: StageFilter): boolean {
  return Object.entries(stages).every(([k, on]) => on === (k === 'failed'))
}

/**
 * Posts that did not go out, as a quiet line beside the title: "2 failed". It stays one line however
 * many fail. Pressing it filters the calendar to them (the stage filter's Failed alone), and pressing
 * it again shows everything.
 */
export function FailedPill({
  posts,
  stages,
  onChange,
}: {
  posts: Post[]
  stages: StageFilter
  onChange: (next: StageFilter) => void
}) {
  const on = onlyFailed(stages)
  // While it filters, it stays even at none left (fixed, or another brand), so it can be cleared.
  if (posts.length === 0 && !on) return null
  return (
    <button
      key={String(on)}
      type="button"
      aria-pressed={on}
      title={on ? 'Show every post' : 'Show only the posts that did not go out'}
      onClick={() => onChange(on ? ALL_STAGES : ONLY_FAILED)}
      className={`bb-pop flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] whitespace-nowrap transition-colors font-medium text-fail-ink ${on ? 'bg-(--fail-soft)' : 'hover:bg-(--fail-soft)'}`}
    >
      <span className="size-1.5 rounded-full bg-fail" />
      {posts.length === 0 ? 'None failed' : `${posts.length} failed`}
      {on && <span className="-mr-0.5 pl-0.5 text-[14px] leading-none opacity-60">×</span>}
    </button>
  )
}
