'use client'

import * as React from 'react'

import { CarouselIcon, ReelIcon, StoryIcon } from '@/components/icons'
import type { BrandId } from '@/data/brands'
import type { Stage } from '@/data/demo'
import { referenceById, type IdeaCard, type IdeaFormat, type IdeaStatus } from '@/data/ideas'
import { dayOf } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'

import { dayIndex, dayLabel, dayOfHook } from './calendar-slot'
import { useIdeas } from './ideas-store'

/**
 * What the ideas page and the shoot brief share: an idea's status as the calendar knows it, its
 * day, and its picture.
 */

export const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'

export const STATUS_LABEL: Record<IdeaStatus, string> = {
  suggested: 'Suggested',
  idea: 'Draft',
  draft: 'Draft',
  awaiting: 'Awaiting approval',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
}

export const CHIPS: Array<Exclude<IdeaStatus, 'suggested' | 'draft' | 'failed'>> = [
  'idea',
  'awaiting',
  'scheduled',
  'posted',
]

export function statusColour(status: IdeaStatus): string {
  if (status === 'suggested') return 'var(--insight-5)'
  if (status === 'idea' || status === 'draft') return 'var(--ink-5)'
  return `var(--stage-${status})`
}

/** A card with what the calendar knows about it: its day and its status. */
export interface Slot {
  card: IdeaCard
  status: IdeaStatus
  /** The day it sits on, or the day a suggestion proposes. */
  dayN: string | null
  label: string | null
  /** True once it is on the calendar. */
  placed: boolean
  order: number
}

export function useSlots(): Slot[] {
  const { brand, weeks, byId } = useBrand()
  const { ideas, suggesting } = useIdeas(brand.id)
  return React.useMemo(() => {
    const hookOf = (id: string) => byId(id)?.hook
    return ideas
      .filter((card) => suggesting || card.status !== 'suggested')
      .map((card) => {
        const stage: Stage | undefined = card.postId ? byId(card.postId)?.stage : undefined
        const status: IdeaStatus =
          card.status === 'suggested' ? 'suggested' : stage && stage !== 'draft' ? stage : 'idea'
        // The calendar decides where a card is: a post sits where the post sits, an idea where its
        // tile is. A day the card remembers only counts for a suggestion, which proposes one.
        const onCalendar = card.postId
          ? dayOf(weeks, card.postId)
          : dayOfHook(weeks, card.hook, hookOf)
        const placed = card.status !== 'suggested' && onCalendar !== null
        const dayN = placed ? onCalendar : card.status === 'suggested' ? (card.dayN ?? null) : null
        // Unsent ideas sort after the dated ones.
        const order = dayN ? dayIndex(weeks, dayN) : 999
        return { card, status, dayN, label: dayN ? dayLabel(weeks, dayN) : null, placed, order }
      })
      .sort((a, b) => a.order - b.order)
  }, [ideas, suggesting, weeks, byId])
}

export function FormatIcon({ format, size = 12 }: { format: IdeaFormat; size?: number }) {
  if (format === 'story') return <StoryIcon size={size} />
  return format === 'reel' ? <ReelIcon size={size} /> : <CarouselIcon size={size} />
}

export function StatusDot({ status }: { status: IdeaStatus }) {
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.06em] uppercase"
      style={{ color: status === 'suggested' ? 'var(--insight-6)' : 'var(--ink-4)' }}
    >
      <span className="size-1.5 rounded-full" style={{ background: statusColour(status) }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** An idea's picture: its own photo, or else the reference it borrows from. */
export function pictureOf(brandId: BrandId, card: IdeaCard): string | undefined {
  const reference = card.referenceId ? referenceById(brandId, card.referenceId) : undefined
  return card.image ?? (reference?.image || undefined)
}
