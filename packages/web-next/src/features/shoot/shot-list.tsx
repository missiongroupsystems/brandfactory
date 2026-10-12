'use client'

import Link from 'next/link'
import * as React from 'react'

import { Media } from '@/components/media'
import { startTouchDrag, touchDragPending } from '@/components/touch-drag'
import type { BrandId } from '@/data/brands'
import { coverOf, isMediaRef, referenceById, type IdeaCard, type Shot } from '@/data/ideas'
import { accept, at, Handle, inside } from '@/features/ideate/drag-parts'
import { FormatIcon } from '@/features/ideate/idea-parts'
import { useSortable } from '@/features/ideate/sortable'

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
 * inside, so the first frame sits on the margin and the last scrolls past the edge. The app's
 * pages pad 40 px (16 on a phone); the public page passes its own.
 */
export const APP_BLEED = '-mx-10 px-10 max-md:-mx-4 max-md:px-4'

/** Shown on hover of its row, on focus, and always where there is no hover. */
const ON_HOVER =
  'opacity-0 transition-opacity group-hover/label:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'

/** Lifted while it is dragged; the others slide out of its way. */
const LIFTABLE = 'transition-[transform,opacity,box-shadow] duration-200'
const LIFTED = 'scale-[1.03] opacity-60 shadow-pop'

/** A drag this close to the line's edge scrolls it, this far a step. */
const EDGE = 56
const STEP = 14

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

/**
 * The shot list as one line, like the clips on an editor's timeline: every shot of the shoot side
 * by side in order, numbered on across the ideas as a call sheet counts them, each idea a group
 * under its own label. The line scrolls sideways past the page's edge.
 *
 * With `onReorderIdeas` a group drags by its label to another place among the ideas; with
 * `onReorder` a frame drags to another place inside its group, never out of it. A long press
 * drags on a phone; Option with an arrow key moves a focused group or frame. `ideaHref` links
 * each label to the idea's page; the public page leaves it out, and `onRemoveIdea` gives each
 * label Remove.
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
  const [groups, attachGroups] = useSortable(ids, 'x', (next) => onReorderIdeas?.(next))
  const line = React.useRef<HTMLOListElement | null>(null)
  const attach = React.useCallback(
    (el: HTMLOListElement | null) => {
      line.current = el
      attachGroups(el)
    },
    [attachGroups],
  )
  const hint = React.useId()
  const starts = startsOf(groups.order, ideas)
  // A finger or a pointer over a frame is over that frame's group.
  const groupOf = (key: string | null) =>
    key?.startsWith('group:')
      ? key.slice(6)
      : key?.startsWith('shot:')
        ? ideas.find((i) => i.shots.some((s) => s.id === key.slice(5)))?.id
        : undefined
  /** A drag near either end of the line scrolls it that way. */
  const scrollNear = (x: number) => {
    const el = line.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (x < r.left + EDGE) el.scrollLeft -= STEP
    else if (x > r.right - EDGE) el.scrollLeft += STEP
  }

  return (
    <>
      {(onReorder || onReorderIdeas) && (
        <p id={hint} className="sr-only">
          Press Option with an arrow key to move it.
        </p>
      )}
      <ol
        ref={attach}
        aria-label="Shots in order"
        onDragEnter={(e) => accept(e, !!groups.dragging)}
        onDragOver={(e) => {
          scrollNear(e.clientX)
          accept(e, !!groups.dragging)
        }}
        onDrop={(e) => {
          if (!groups.dragging) return
          e.preventDefault()
          groups.end(true)
        }}
        className={`flex items-start overflow-x-auto pt-1 pb-2 [scrollbar-width:none] ${bleed}`}
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
            scrollNear={scrollNear}
            onReorder={onReorder ? (shotIds) => onReorder(card.id, shotIds) : undefined}
            onRemove={onRemoveIdea ? () => onRemoveIdea(card.id) : undefined}
            drag={
              onReorderIdeas
                ? {
                    held: groups.dragging === card.id,
                    any: !!groups.dragging,
                    begin: () => groups.start(card.id),
                    over: (key, p) => {
                      const g = groupOf(key)
                      if (g) groups.overAt(g, p)
                    },
                    finish: (commit) => groups.end(commit),
                    nudge: (by) => groups.nudge(card.id, by),
                    line: () => line.current,
                  }
                : undefined
            }
          />
        ))}
      </ol>
    </>
  )
}

interface GroupDrag {
  held: boolean
  /** Some group is held: the groups make way, the frames stand still. */
  any: boolean
  begin: () => void
  over: (key: string | null, p: Point) => void
  finish: (commit: boolean) => void
  nudge: (by: -1 | 1) => void
  line: () => HTMLElement | null
}

/**
 * One idea on the line: its label, then its frames in their own sortable row. The label is the
 * group's grip; the frames sort among themselves and refuse a frame from another group.
 */
function Group({
  brandId,
  card,
  index,
  start,
  label,
  href,
  hint,
  scrollNear,
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
  scrollNear: (x: number) => void
  onReorder?: (shotIds: string[]) => void
  onRemove?: () => void
  drag?: GroupDrag
}) {
  const shotIds = card.shots.map((s) => s.id)
  const [sort, attach] = useSortable(shotIds, 'x', (next) => onReorder?.(next))
  const key = `group:${card.id}`
  return (
    <li
      data-drop={key}
      data-flip={card.id}
      style={{ order: index }}
      onDragOver={(e) => {
        if (!drag || !accept(e, drag.any)) return
        if (!drag.held) drag.over(key, at(e))
      }}
      onDrop={(e) => {
        if (!drag?.any) return
        e.preventDefault()
        e.stopPropagation()
        drag.finish(true)
      }}
      className={`flex shrink-0 flex-col gap-3 ${LIFTABLE} ${drag?.held ? 'opacity-60' : ''} ${index > 0 ? 'ml-6 border-l border-(--cal-line) pl-6' : ''}`}
    >
      {label && (
        <div
          draggable={!!drag}
          onPointerDown={(e) => {
            if (!drag || (e.target as HTMLElement).closest('a, button')) return
            let last: Point | null = null
            startTouchDrag(e, {
              start: drag.begin,
              move: (k, p) => {
                last = p
                scrollNear(p.x)
                drag.over(k, p)
              },
              drop: () => drag.finish(inside(drag.line(), last)),
              end: () => drag.finish(false),
            })
          }}
          onDragStart={(e) => {
            if (!drag) return
            if (touchDragPending()) return e.preventDefault()
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', key)
            drag.begin()
          }}
          onDragEnd={() => drag?.finish(false)}
          className={`group/label bb-touch-drag relative flex min-w-0 items-baseline gap-2.5 pr-1 ${drag ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          {drag && <Handle label={`Move group: ${card.hook}`} hint={hint} onNudge={drag.nudge} />}
          {href ? (
            <Link
              href={href}
              draggable={false}
              className="truncate font-display text-[18px] leading-[1.2] tracking-[-0.015em] transition-opacity hover:opacity-70"
            >
              {card.hook}
            </Link>
          ) : (
            <h3 className="truncate font-display text-[18px] leading-[1.2] tracking-[-0.015em]">
              {card.hook}
            </h3>
          )}
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-4 uppercase">
            <FormatIcon format={card.format} size={10} />
            {FORMAT_LABEL[card.format]}
          </span>
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${card.hook}`}
              onClick={onRemove}
              className={`ml-auto shrink-0 text-[12px] text-ink-4 hover:text-ink ${ON_HOVER}`}
            >
              Remove
            </button>
          )}
        </div>
      )}
      {card.shots.length === 0 ? (
        <p className="text-[13px] text-ink-4">No storyboard yet.</p>
      ) : (
        <ol
          ref={attach}
          aria-label={`Shots of ${card.hook}`}
          onDragEnter={(e) => accept(e, !!sort.dragging)}
          onDragOver={(e) => accept(e, !!sort.dragging)}
          onDrop={(e) => {
            if (!sort.dragging) return
            e.preventDefault()
            e.stopPropagation()
            sort.end(true)
          }}
          className="flex gap-2"
        >
          {card.shots.map((shot) => (
            <Frame
              key={shot.id}
              shot={shot}
              src={shotImage(brandId, card, shot)}
              aspect={ASPECT[card.format]}
              index={sort.order.indexOf(shot.id)}
              n={start + sort.order.indexOf(shot.id) + 1}
              held={sort.dragging === shot.id}
              drag={
                onReorder
                  ? {
                      any: !!sort.dragging,
                      begin: () => sort.start(shot.id),
                      over: (id, p) => sort.overAt(id, p),
                      finish: (commit) => sort.end(commit),
                      nudge: (by) => sort.nudge(shot.id, by),
                      hint,
                      scrollNear,
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
  /** A frame of this group is held: the others make way. */
  any: boolean
  begin: () => void
  /** The pointer is over the frame `id`, at `p`: the held one slides before or after it. */
  over: (id: string, p: Point) => void
  finish: (commit: boolean) => void
  nudge: (by: -1 | 1) => void
  hint: string
  scrollNear: (x: number) => void
}

/** One frame: the picture, its number in the corner and its line over the foot. */
function Frame({
  shot,
  src,
  aspect,
  index,
  n,
  held,
  drag,
}: {
  shot: Shot
  src?: string
  aspect: string
  index: number
  n: number
  held: boolean
  drag?: FrameDrag
}) {
  const key = `shot:${shot.id}`
  const name = shot.title || 'Untitled shot'
  return (
    <li
      data-drop={key}
      data-flip={shot.id}
      draggable={!!drag}
      style={{ order: index }}
      onPointerDown={(e) => {
        if (!drag || (e.target as HTMLElement).closest('button')) return
        const list = e.currentTarget.parentElement
        let last: Point | null = null
        startTouchDrag(e, {
          start: drag.begin,
          move: (k, p) => {
            last = p
            drag.scrollNear(p.x)
            if (k?.startsWith('shot:')) drag.over(k.slice(5), p)
          },
          // A lift inside the group keeps the order it drew; a lift elsewhere puts it back.
          drop: () => drag.finish(inside(list, last)),
          end: () => drag.finish(false),
        })
      }}
      onDragStart={(e) => {
        if (!drag) return
        if (touchDragPending()) return e.preventDefault()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
        drag.begin()
      }}
      onDragEnd={() => drag?.finish(false)}
      onDragEnter={(e) => accept(e, !!drag?.any)}
      onDragOver={(e) => {
        if (!drag || !accept(e, drag.any)) return
        if (!held) drag.over(shot.id, at(e))
      }}
      onDrop={(e) => {
        if (!drag?.any) return
        e.preventDefault()
        e.stopPropagation()
        drag.finish(true)
      }}
      className={`bb-touch-drag relative w-[228px] shrink-0 max-md:w-[168px] ${drag ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {drag && <Handle label={`Move shot ${n}: ${name}`} hint={drag.hint} onNudge={drag.nudge} />}
      <span
        className={`relative block overflow-hidden rounded-[14px] bg-tile ${LIFTABLE} ${aspect} ${held ? LIFTED : ''}`}
      >
        {src && <Media src={src} sizes="(max-width: 768px) 168px, 228px" />}
        <span className="absolute top-2.5 left-2.5 rounded-full bg-black/35 px-2 py-0.5 font-mono text-[10px] text-white tabular-nums backdrop-blur-sm">
          {String(n).padStart(2, '0')}
        </span>
        <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/65 to-transparent px-3 pt-10 pb-3 text-[13px] leading-snug text-white">
          {name}
        </span>
      </span>
    </li>
  )
}

/** How many shots the ideas hold together. */
export const shotCount = (ideas: IdeaCard[]) => ideas.reduce((n, i) => n + i.shots.length, 0)
