'use client'

import * as React from 'react'

import { CarouselIcon, ReelIcon, StoryIcon } from '@/components/icons'
import type { Stage } from '@/data/demo'
import type { IdeaCard, IdeaFormat, IdeaStatus } from '@/data/ideas'
import { dayOf } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'

import { dayLabel, dayOfHook } from './calendar-slot'
import { setHook, useIdeas } from './ideas-store'

/**
 * What the ideas page and the shoot brief share: an idea's status as the calendar knows it, its
 * day, and a new hook carried to the calendar.
 */

/** A small label over a group, in words and sentence case: never a mono kicker. */
export const EYEBROW = 'text-[13px] font-medium text-ink-3'

export const STATUS_LABEL: Record<IdeaStatus, string> = {
  suggested: 'Suggested',
  idea: 'Idea',
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
}

export const CHIPS: Array<Exclude<IdeaStatus, 'suggested' | 'failed'>> = [
  'idea',
  'draft',
  'scheduled',
  'posted',
]

export function statusColour(status: IdeaStatus): string {
  if (status === 'suggested') return 'var(--insight-5)'
  if (status === 'idea') return 'var(--ink-5)'
  return `var(--stage-${status})`
}

/** A card with what the calendar knows about it: its day and its status. */
export interface Slot {
  card: IdeaCard
  status: IdeaStatus
  /** The day it sits on, or the day a suggestion proposes. */
  date: string | null
  label: string | null
  /** True once it is on the calendar. */
  placed: boolean
}

/** Every card as the calendar knows it. Suggestions are in once asked for, or when `all` is set. */
export function useSlots(all = false): Slot[] {
  const { brand, weeks, byId } = useBrand()
  const { ideas, suggesting } = useIdeas(brand.id)
  return React.useMemo(() => {
    const hookOf = (id: string) => byId(id)?.hook
    return (
      ideas
        .filter((card) => all || suggesting || card.status !== 'suggested')
        .map((card) => {
          const stage: Stage | undefined = card.postId ? byId(card.postId)?.stage : undefined
          const status: IdeaStatus = card.status === 'suggested' ? 'suggested' : (stage ?? 'idea')
          // The calendar decides where a card is: a post sits where the post sits, an idea where its
          // tile is. A day the card remembers only counts for a suggestion, which proposes one.
          const onCalendar = card.postId
            ? dayOf(weeks, card.postId)
            : dayOfHook(weeks, card.hook, hookOf)
          const placed = card.status !== 'suggested' && onCalendar !== null
          const date = placed
            ? onCalendar
            : card.status === 'suggested'
              ? (card.date ?? null)
              : null
          return { card, status, date, label: date ? dayLabel(date) : null, placed }
        })
        // By day; unsent ideas sort after the dated ones.
        .sort((a, b) => (a.date ?? '~').localeCompare(b.date ?? '~'))
    )
  }, [ideas, suggesting, all, weeks, byId])
}

export function FormatIcon({ format, size = 12 }: { format: IdeaFormat; size?: number }) {
  if (format === 'story') return <StoryIcon size={size} />
  return format === 'reel' ? <ReelIcon size={size} /> : <CarouselIcon size={size} />
}

/**
 * A new hook for a card, carried to the calendar: its post takes the words, or its idea tile does,
 * since an unplanned idea is found on the calendar by its hook.
 */
export function useRename(card: IdeaCard) {
  const { brand, renamePost, renameIdea } = useBrand()
  return (hook: string) => {
    if (card.postId) renamePost(card.postId, hook)
    else renameIdea(card.hook, hook)
    setHook(brand.id, card.id, hook)
  }
}
