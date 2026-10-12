'use client'

import Link from 'next/link'
import * as React from 'react'

import { Media } from '@/components/media'
import type { BrandId } from '@/data/brands'
import { coverOf, isMediaRef, referenceById, type IdeaCard, type Shot } from '@/data/ideas'
import { Handle } from '@/features/ideate/drag-parts'
import { FormatIcon } from '@/features/ideate/idea-parts'
import { useSortable } from '@/features/ideate/sortable'

import { startLineDrag } from './line-drag'

const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const

/** A reel's and a story's frames stand; a carousel's slides are the post's 4:5. */
const ASPECT = { reel: 'aspect-[9/16]', story: 'aspect-[9/16]', carousel: 'aspect-[4/5]' } as const

/**
 * What a shot looks like on the sheet: what was captured, else the reference it is shot like,
 * else the idea's cover.
 */
export function shotImage(brandId: BrandId, card: IdeaCard, shot: Shot): string | undefined {
  if (shot.media) return shot.media
  if (shot.ref) return isMediaRef(shot.ref) ? shot.ref : referenceById(brandId, shot.ref)?.image
  return coverOf(brandId, card)
}

/**
 * The line runs out to the page's edge: it undoes the page's side padding and puts it back
 * inside, so the first clip sits on the margin and the line runs past the edge. The app's pages
 * pad 40 px (16 on a phone); the public page passes its own.
 */
export const APP_BLEED = '-mx-10 px-10 max-md:-mx-4 max-md:px-4'

/** Shown on hover of its label, on focus, and always where there is no hover. */
const ON_HOVER =
  'opacity-0 transition-opacity group-hover/label:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'

type Point = { x: number; y: number }

/** Where each group's numbers begin, in the live order of the groups. */
function startsOf(order: string[], ideas: IdeaCard[]): Map<string, number> {
  const starts = new Map<string, number>()
  order.reduce((n, id) => {
    starts.set(id, n)
    return n + (ideas.find((i) => i.id === id)?.shots.length ?? 0)
  }, 0)
  return starts
}

/** No drag starts on a control inside the item. */
const onControl = (e: React.PointerEvent) =>
  !!(e.target as HTMLElement).closest('a, button, .bb-menu')

/**
 * The shot list as one line, like the clips on an editor's timeline: every shot of the shoot side
 * by side in order, numbered on across the ideas as a call sheet counts them, each idea a group
 * under its own label. The line scrolls sideways past the page's edge.
 *
 * With `onReorderIdeas` a group drags by its label to another place among the ideas; with
 * `onReorder` a clip drags to another place inside its group, never out of it (`line-drag.ts`:
 * a mouse, or a long press). Option with an arrow key moves a focused group or clip. `ideaHref`
 * links each label to the idea's page; the public page leaves it out, and `onRemoveIdea` gives
 * each label Remove.
 */
export function ShotList({
  brandId,
  ideas,
  ideaHref,
  headings = true,
  bleed = APP_BLEED,
  onReorder,
  onReorderIdeas,
  onRemoveIdea,
}: {
  brandId: BrandId
  ideas: IdeaCard[]
  ideaHref?: (id: string) => string
  /** Off for one idea's own brief, whose hook is already the page's title. */
  headings?: boolean
  /** The classes that take the line out to the page's edge; `APP_BLEED` for the app's pages. */
  bleed?: string
  onReorder?: (ideaId: string, shotIds: string[]) => void
  onReorderIdeas?: (ideaIds: string[]) => void
  onRemoveIdea?: (ideaId: string) => void
}) {
  const ids = ideas.map((i) => i.id)
  const [groups, attach] = useSortable(ids, 'x', (next) => onReorderIdeas?.(next))
  const line = React.useRef<HTMLDivElement>(null)
  const hint = React.useId()
  const starts = startsOf(groups.order, ideas)
  // A pointer over a clip is over that clip's group.
  const groupOf = (key: string | null) =>
    key?.startsWith('group:')
      ? key.slice(6)
      : key?.startsWith('shot:')
        ? ideas.find((i) => i.shots.some((s) => s.id === key.slice(5)))?.id
        : undefined

  return (
    <>
      {(onReorder || onReorderIdeas) && (
        <p id={hint} className="sr-only">
          Press Option with an arrow key to move it.
        </p>
      )}
      <div ref={line} className={`overflow-x-auto pt-1 pb-2 [scrollbar-width:none] ${bleed}`}>
        <ol
          ref={attach}
          aria-label="Shots in order"
          className="flex w-max min-w-full items-start gap-7 max-md:gap-4"
        >
          {ideas.map((card) => (
            <Group
              key={card.id}
              brandId={brandId}
              card={card}
              index={groups.order.indexOf(card.id)}
              start={starts.get(card.id) ?? 0}
              label={headings}
              href={ideaHref?.(card.id)}
              hint={hint}
              line={line}
              onReorder={onReorder ? (shotIds) => onReorder(card.id, shotIds) : undefined}
              onRemove={onRemoveIdea ? () => onRemoveIdea(card.id) : undefined}
              drag={
                onReorderIdeas
                  ? {
                      held: groups.dragging === card.id,
                      begin: () => groups.start(card.id),
                      over: (key, p) => {
                        const g = groupOf(key)
                        if (g) groups.overAt(g, p)
                      },
                      finish: (commit) => groups.end(commit),
                      nudge: (by) => groups.nudge(card.id, by),
                    }
                  : undefined
              }
            />
          ))}
        </ol>
      </div>
    </>
  )
}

interface GroupDrag {
  held: boolean
  begin: () => void
  over: (key: string | null, p: Point) => void
  finish: (commit: boolean) => void
  nudge: (by: -1 | 1) => void
}

/**
 * One idea on the line: its label, then its clips in their own sortable row. The label is the
 * group's grip; the clips sort among themselves and refuse a clip from another group.
 */
function Group({
  brandId,
  card,
  index,
  start,
  label,
  href,
  hint,
  line,
  onReorder,
  onRemove,
  drag,
}: {
  brandId: BrandId
  card: IdeaCard
  index: number
  start: number
  label: boolean
  href?: string
  hint: string
  line: React.RefObject<HTMLDivElement | null>
  onReorder?: (shotIds: string[]) => void
  onRemove?: () => void
  drag?: GroupDrag
}) {
  const shotIds = card.shots.map((s) => s.id)
  const [sort, attach] = useSortable(shotIds, 'x', (next) => onReorder?.(next))
  const hook = href ? (
    <Link href={href} draggable={false} className="truncate hover:underline">
      {card.hook}
    </Link>
  ) : (
    <h3 className="truncate">{card.hook}</h3>
  )
  const format = (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-[0.06em] text-ink-4 uppercase">
      <FormatIcon format={card.format} size={9} />
      {FORMAT_LABEL[card.format]}
    </span>
  )
  // Remove shows on hover of the label; a finger gets it from a small "…" beside the format.
  const [more, setMore] = React.useState(false)
  const remove = onRemove && (
    <>
      <button
        type="button"
        aria-label={`Remove ${card.hook}`}
        onClick={onRemove}
        className={`ml-auto shrink-0 text-[11.5px] text-ink-4 hover:text-ink [@media(hover:none)]:hidden ${ON_HOVER}`}
      >
        Remove
      </button>
      <span className="relative flex [@media(hover:hover)]:hidden">
        <button
          type="button"
          aria-label={`More for ${card.hook}`}
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          className="flex h-6 w-7 items-center justify-center rounded-full text-ink-4 transition-colors hover:text-ink"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <circle cx="2" cy="6" r="1.1" />
            <circle cx="6" cy="6" r="1.1" />
            <circle cx="10" cy="6" r="1.1" />
          </svg>
        </button>
        {more && (
          <span className="bb-menu absolute top-full right-0 z-20 mt-1 rounded-[12px] bg-page p-1 shadow-pop">
            <button
              type="button"
              onClick={() => {
                setMore(false)
                onRemove()
              }}
              className="flex h-9 items-center rounded-[9px] px-3 text-[13px] font-normal whitespace-nowrap text-fail-ink hover:bg-surface"
            >
              Remove from shoot
            </button>
          </span>
        )}
      </span>
    </>
  )
  return (
    <li
      data-drop={`group:${card.id}`}
      data-flip={card.id}
      style={{ order: index }}
      className="flex shrink-0 flex-col gap-2"
    >
      {label && (
        <div
          data-grip={drag ? '' : undefined}
          onPointerDown={(e) => {
            if (!drag || onControl(e)) return
            startLineDrag(e, {
              source: e.currentTarget.parentElement!,
              scroller: line.current,
              scale: 1.02,
              start: drag.begin,
              over: drag.over,
              end: drag.finish,
            })
          }}
          onDragStart={(e) => e.preventDefault()}
          className={`group/label bb-touch-drag relative flex w-full min-w-0 flex-col gap-2 pb-1 text-[12.5px] font-medium select-none ${drag ? 'cursor-grab' : ''}`}
        >
          {drag && <Handle label={`Move group: ${card.hook}`} hint={hint} onNudge={drag.nudge} />}
          <span className="flex min-w-0 items-center gap-2 px-0.5">
            {hook}
            {format}
            {remove}
          </span>
          {/* The clip bar: it spans the group's clips, and deepens under the pointer or a drag. */}
          <span
            className={`h-[3px] w-full rounded-full transition-colors duration-200 ${drag?.held ? 'bg-(--layer-shoot-ink)' : 'bg-(--layer-shoot) group-hover/label:bg-(--layer-shoot-ink)'}`}
          />
        </div>
      )}
      {card.shots.length === 0 ? (
        <p className="text-[12.5px] text-ink-4">No storyboard yet.</p>
      ) : (
        <ol ref={attach} aria-label={`Shots of ${card.hook}`} className="flex gap-1.5">
          {card.shots.map((shot) => (
            <Frame
              key={shot.id}
              shot={shot}
              src={shotImage(brandId, card, shot)}
              aspect={ASPECT[card.format]}
              index={sort.order.indexOf(shot.id)}
              n={start + sort.order.indexOf(shot.id) + 1}
              drag={
                onReorder
                  ? {
                      begin: () => sort.start(shot.id),
                      over: (key, p) => {
                        if (key?.startsWith('shot:')) sort.overAt(key.slice(5), p)
                      },
                      finish: (commit) => sort.end(commit),
                      nudge: (by) => sort.nudge(shot.id, by),
                      hint,
                      line,
                    }
                  : undefined
              }
            />
          ))}
        </ol>
      )}
    </li>
  )
}

interface FrameDrag {
  begin: () => void
  over: (key: string | null, p: Point) => void
  finish: (commit: boolean) => void
  nudge: (by: -1 | 1) => void
  hint: string
  line: React.RefObject<HTMLDivElement | null>
}

/** One clip: the picture, then its number and its line under it. */
function Frame({
  shot,
  src,
  aspect,
  index,
  n,
  drag,
}: {
  shot: Shot
  src?: string
  aspect: string
  index: number
  n: number
  drag?: FrameDrag
}) {
  const name = shot.title || 'Untitled shot'
  return (
    <li
      data-drop={`shot:${shot.id}`}
      data-flip={shot.id}
      style={{ order: index }}
      onPointerDown={(e) => {
        if (!drag || onControl(e)) return
        const row = e.currentTarget.parentElement
        startLineDrag(e, {
          source: e.currentTarget,
          scroller: drag.line.current,
          bounds: () => row?.getBoundingClientRect() ?? null,
          scale: 1.05,
          start: drag.begin,
          over: drag.over,
          end: drag.finish,
        })
      }}
      onDragStart={(e) => e.preventDefault()}
      className={`group/clip bb-touch-drag relative flex w-[152px] shrink-0 flex-col gap-1.5 select-none max-md:w-[108px] ${drag ? 'cursor-grab' : ''}`}
    >
      {drag && <Handle label={`Move shot ${n}: ${name}`} hint={drag.hint} onNudge={drag.nudge} />}
      <span
        className={`relative block overflow-hidden rounded-[10px] bg-tile transition-[transform,box-shadow] duration-200 ${aspect} after:pointer-events-none after:absolute after:inset-0 after:rounded-[10px] after:shadow-[inset_0_0_0_1px_rgba(18,18,18,0.07)] after:content-[''] group-focus-within/clip:shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)] ${drag ? 'group-hover/clip:-translate-y-0.5 group-hover/clip:shadow-soft' : ''}`}
      >
        {src && <Media src={src} sizes="(max-width: 768px) 108px, 152px" />}
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5 px-0.5">
        <span className="font-mono text-[10px] text-ink-4 tabular-nums">
          {String(n).padStart(2, '0')}
        </span>
        <span className="min-w-0 text-[12px] leading-snug text-ink-2 max-md:line-clamp-2 md:truncate">
          {name}
        </span>
      </span>
    </li>
  )
}

/** How many shots the ideas hold together. */
export const shotCount = (ideas: IdeaCard[]) => ideas.reduce((n, i) => n + i.shots.length, 0)
