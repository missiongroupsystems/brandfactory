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
 * Posts that did not go out, as one quiet pill in the header: "2 not posted". It stays one line
 * however many fail. Pressing it filters the calendar to them (the stage filter's Failed alone),
 * and pressing it again shows everything.
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
      className={`bb-pop flex h-9 items-center gap-2 rounded-full pr-3.5 pl-3 text-[13px] font-medium transition-colors ${on ? 'bg-(--fail-soft) text-fail-ink shadow-[inset_0_0_0_1px_var(--fail-line)]' : 'bg-page text-fail-ink shadow-[inset_0_0_0_1px_var(--fail-line)] hover:bg-(--fail-soft)'}`}
    >
      <span className="size-2 rounded-full bg-fail shadow-[0_0_0_3px_color-mix(in_oklab,var(--fail)_16%,transparent)]" />
      {posts.length === 0 ? 'None not posted' : `${posts.length} not posted`}
      {on && <span className="-mr-1 pl-0.5 text-[15px] leading-none opacity-70">×</span>}
    </button>
  )
}
