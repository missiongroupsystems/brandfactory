'use client'

import type { BrandId } from '@/data/brands'
import { coverOf, type IdeaCard, type IdeaFormat } from '@/data/ideas'
import { dayLabel, dayOfHook } from '@/features/ideate/calendar-slot'
import { FormatIcon } from '@/features/ideate/idea-parts'
import { useIdeasById } from '@/features/ideate/ideas-store'
import { useBrand } from '@/features/schedule/posts-store'

import type { Card as Model } from './model'
import { Card, META, Slide, Thumb, TITLE, useSettled } from './shell'

export const FORMAT_LABEL: Record<IdeaFormat, string> = {
  reel: 'Reel',
  carousel: 'Carousel',
  story: 'Story',
}

/** What the card keeps of an idea when its move is called: the idea, and the day it sat on. */
export interface IdeaSnapshot {
  card: IdeaCard
  day: string | null
}

const isSnapshot = (v: unknown): v is IdeaSnapshot =>
  typeof v === 'object' && v !== null && 'card' in v

/**
 * An idea as Ideate draws it small: its cover, its hook, its format and the day it sits on. Live
 * from the ideas store; from the move's input while the store has nothing; from the snapshot once
 * removed. A move slides the day from the old one to the new.
 */
export function IdeaTile({ model, index }: { model: Model; index: number }) {
  const { brand, weeks, byId } = useBrand()
  const live = useIdeasById().get(model.id)
  const kept = isSnapshot(model.snapshot) ? model.snapshot : undefined
  const card: Partial<IdeaCard> = live?.card ?? kept?.card ?? {}
  const hook = card.hook ?? str(model.input.hook)
  const format = (card.format ?? str(model.input.format)) as IdeaFormat | ''
  const brandId = (live?.brandId ?? model.brand) as BrandId
  const cover =
    card.inspiration && brandId
      ? coverOf(brandId, { image: card.image, inspiration: card.inspiration })
      : (card.image ?? str(model.input.image) ?? undefined)
  const onCalendar =
    live && brandId === brand.id ? dayOfHook(weeks, live.card.hook, (id) => byId(id)?.hook) : null
  const now = str(model.input.day) || onCalendar || kept?.day || null
  const { value: day, moved } = useSettled(kept?.day ?? undefined, now)
  const words = day ? dayLabel(day) : 'No day yet'
  return (
    <Card
      verb={model.verb}
      href={model.id ? `/ideate/${encodeURIComponent(model.id)}` : undefined}
      removed={model.removed}
      index={index}
      label={`Idea: ${hook}`}
    >
      <span className="flex items-start gap-3">
        <Thumb
          src={cover || undefined}
          className="h-[75px] w-[60px]"
          fallback={format ? <FormatIcon format={format} size={18} /> : undefined}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <span className={`${TITLE} line-clamp-2`}>{hook || 'An idea'}</span>
          <span className={META}>
            {format && (
              <>
                <FormatIcon format={format} size={10} />
                <span>{FORMAT_LABEL[format]}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <Slide moved={moved}>{words}</Slide>
          </span>
        </span>
      </span>
    </Card>
  )
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
