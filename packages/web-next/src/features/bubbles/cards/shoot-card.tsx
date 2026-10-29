'use client'

import type { BrandId } from '@/data/brands'
import { coverOf } from '@/data/ideas'
import type { CrewMember, Shoot } from '@/data/shoots'
import { useIdeasById } from '@/features/ideate/ideas-store'
import { useShootById } from '@/features/shoot/shoots-store'
import { MONTH_SHORT, WEEKDAY, dayNumber, monthOf, weekdayOf } from '@/lib/dates'

import type { Card as Model } from './model'
import { Card, Initials, META, Slide, Stack, Thumb, TITLE, useSettled } from './shell'

const isShoot = (v: unknown): v is Shoot =>
  typeof v === 'object' && v !== null && 'ideaIds' in v && 'crew' in v

/**
 * A shoot as its call sheet opens: the day as a date block, the title, the hours and the place,
 * the ideas it shoots as thumbnails and who comes as initials. A day change slides the block.
 */
export function ShootCard({ model, index }: { model: Model; index: number }) {
  const found = useShootById(model.id)
  const ideas = useIdeasById()
  const kept = isShoot(model.snapshot) ? model.snapshot : undefined
  const shoot = found?.shoot ?? kept
  const input = model.input
  const title = shoot?.title ?? str(input.title) ?? 'A shoot'
  const dateNow = shoot?.date ?? str(input.day)
  const { value: date, moved } = useSettled(kept?.date, dateNow)
  const start = shoot?.start ?? str(input.start)
  const end = shoot?.end ?? str(input.end)
  const place = shoot?.place ?? str(input.place)
  const ideaIds =
    shoot?.ideaIds ??
    (Array.isArray(input.ideaIds) ? (input.ideaIds as string[]) : []).concat(
      str(input.ideaId) ? [str(input.ideaId)] : [],
    )
  const crew: CrewMember[] =
    shoot?.crew ?? (Array.isArray(input.crew) ? (input.crew as CrewMember[]) : [])
  const brandId = (found?.brandId ?? model.brand) as BrandId
  const covers = ideaIds
    .map((id) => ideas.get(id)?.card)
    .flatMap((card) => (card ? [coverOf(brandId, card)] : []))
    .slice(0, 3)
  const hours = [start, end].filter(Boolean).join('–')
  return (
    <Card
      verb={model.verb}
      href={model.id ? `/shoot/${encodeURIComponent(model.id)}` : undefined}
      removed={model.removed}
      index={index}
      label={`Shoot: ${title}`}
    >
      <span className="flex items-start gap-3">
        <Slide moved={moved}>
          <span
            className="flex h-[60px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[10px] text-ink"
            style={{ background: 'var(--layer-shoot)', color: 'var(--layer-shoot-ink)' }}
          >
            {date ? (
              <>
                <span className="font-mono text-[12px] tracking-[0.08em] uppercase opacity-80">
                  {WEEKDAY[weekdayOf(date)]}
                </span>
                <span className="font-display text-[22px] leading-none">{dayNumber(date)}</span>
                <span className="text-[12px] opacity-80">{MONTH_SHORT[monthOf(date).month]}</span>
              </>
            ) : (
              <span className="text-[12px] opacity-80">No day</span>
            )}
          </span>
        </Slide>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <span className={`${TITLE} truncate`}>{title}</span>
          <span className={META}>
            <span className="truncate">{[hours, place].filter(Boolean).join(' · ')}</span>
          </span>
          {(covers.length > 0 || crew.length > 0) && (
            <span className="mt-auto flex items-center gap-3">
              {covers.length > 0 && (
                <Stack>
                  {covers.map((src, i) => (
                    <Thumb key={i} src={src} className="size-6 rounded-full ring-2 ring-page" />
                  ))}
                </Stack>
              )}
              {crew.length > 0 && (
                <Stack>
                  {crew.slice(0, 4).map((c, i) => (
                    <Initials key={`${c.name}-${i}`} name={c.name} size={24} />
                  ))}
                  {crew.length > 4 && (
                    <span className="pl-2.5 text-[12px] text-ink-4">+{crew.length - 4}</span>
                  )}
                </Stack>
              )}
            </span>
          )}
        </span>
      </span>
    </Card>
  )
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
