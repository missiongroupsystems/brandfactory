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
 * The strip runs out to the page's edge: it undoes the page's side padding and puts it back
 * inside, so the first frame sits on the margin and the last scrolls past the edge. The app's
 * pages pad 40 px (16 on a phone); the public page passes its own.
 */
export const APP_BLEED = '-mx-10 px-10 scroll-pl-10 max-md:-mx-4 max-md:px-4 max-md:scroll-pl-4'

/** Shown on hover of its row, on focus, and always where there is no hover. */
const ON_HOVER =
  'opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'

/**
 * The shot list: each idea as a short heading, then its storyboard as a filmstrip of frames,
 * numbered on across ideas as a call sheet counts them. The strip scrolls sideways past the
 * edge. `ideaHref` links each heading to the idea's page; the public page leaves it out. With
 * `onReorder` the frames drag into a new order inside their idea (a long press on a phone;
 * Option with an arrow key on a frame's handle); with `onRemoveIdea` each heading has Remove.
 */
export function ShotList({
  brandId,
  ideas,
  ideaHref,
  headings = true,
  bleed = APP_BLEED,
  onReorder,
  onRemoveIdea,
}: {
  brandId: BrandId
  ideas: IdeaCard[]
  ideaHref?: (id: string) => string
  /** Off for one idea's own brief, whose hook is already the page's title. */
  headings?: boolean
  /** The classes that take the strip out to the page's edge; `APP_BLEED` for the app's pages. */
  bleed?: string
  onReorder?: (ideaId: string, shotIds: string[]) => void
  onRemoveIdea?: (ideaId: string) => void
}) {
  // Where each idea's numbers begin: the shots of the ideas before it.
  const starts = ideas.map((_, i) => shotCount(ideas.slice(0, i)))
  return (
    <div className="flex flex-col gap-12 max-md:gap-10">
      {ideas.map((card, i) => (
        <section key={card.id} aria-label={card.hook} className="flex flex-col gap-4">
          <div className={headings ? 'group/row flex flex-col gap-1' : 'hidden'}>
            <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-4 uppercase">
              <FormatIcon format={card.format} size={10} />
              {FORMAT_LABEL[card.format]}
              {card.feature && <span className="truncate normal-case"> · {card.feature}</span>}
              {onRemoveIdea && (
                <button
                  type="button"
                  aria-label={`Remove ${card.hook}`}
                  onClick={() => onRemoveIdea(card.id)}
                  className={`ml-auto font-sans text-[12px] tracking-normal normal-case hover:text-ink ${ON_HOVER}`}
                >
                  Remove
                </button>
              )}
            </span>
            {ideaHref ? (
              <Link
                href={ideaHref(card.id)}
                className="font-display text-[22px] leading-[1.15] tracking-[-0.015em] transition-opacity hover:opacity-70 max-md:text-[19px]"
              >
                {card.hook}
              </Link>
            ) : (
              <h3 className="font-display text-[22px] leading-[1.15] tracking-[-0.015em] max-md:text-[19px]">
                {card.hook}
              </h3>
            )}
          </div>
          {card.shots.length === 0 ? (
            <p className="text-[13px] text-ink-4">No storyboard yet.</p>
          ) : (
            <Filmstrip
              brandId={brandId}
              card={card}
              start={starts[i]!}
              bleed={bleed}
              onReorder={onReorder ? (ids) => onReorder(card.id, ids) : undefined}
            />
          )}
        </section>
      ))}
    </div>
  )
}

/** The frames of one idea in a row that scrolls past the page's edge, each at its live place. */
function Filmstrip({
  brandId,
  card,
  start,
  bleed,
  onReorder,
}: {
  brandId: BrandId
  card: IdeaCard
  start: number
  bleed: string
  onReorder?: (shotIds: string[]) => void
}) {
  const ids = card.shots.map((s) => s.id)
  const [sort, attach] = useSortable(ids, 'x', (next) => onReorder?.(next))
  const hint = React.useId()
  return (
    <>
      {onReorder && (
        <p id={hint} className="sr-only">
          Press Option with an arrow key to move it.
        </p>
      )}
      <ol
        ref={attach}
        aria-label={`Shots of ${card.hook}`}
        onDragEnter={(e) => accept(e, !!sort.dragging)}
        onDragOver={(e) => accept(e, !!sort.dragging)}
        onDrop={(e) => {
          if (!sort.dragging) return
          e.preventDefault()
          sort.end(true)
        }}
        className={`flex snap-x gap-2 overflow-x-auto pt-1 pb-2 [scrollbar-width:none] ${bleed}`}
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
                    begin: () => sort.start(shot.id),
                    over: (id, p) => sort.overAt(id, p),
                    finish: (commit) => sort.end(commit),
                    nudge: (by) => sort.nudge(shot.id, by),
                    hint,
                    dragging: !!sort.dragging,
                  }
                : undefined
            }
          />
        ))}
      </ol>
    </>
  )
}

interface Drag {
  begin: () => void
  /** The pointer is over the frame `id`, at `p`: the held one slides before or after it. */
  over: (id: string, p: { x: number; y: number }) => void
  finish: (commit: boolean) => void
  nudge: (by: -1 | 1) => void
  hint: string
  dragging: boolean
}

/**
 * One frame: the picture, its number in the corner and its line over the foot. Lifted while it
 * is dragged; the others slide out of its way.
 */
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
  drag?: Drag
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
        let last: { x: number; y: number } | null = null
        startTouchDrag(e, {
          start: drag.begin,
          move: (k, p) => {
            last = p
            if (k?.startsWith('shot:')) drag.over(k.slice(5), p)
          },
          // A lift inside the strip keeps the order it drew; a lift elsewhere puts it back.
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
      onDragEnter={(e) => accept(e, !!drag?.dragging)}
      onDragOver={(e) => {
        if (!drag || !accept(e, drag.dragging)) return
        if (!held) drag.over(shot.id, at(e))
      }}
      onDrop={(e) => {
        if (!drag?.dragging) return
        e.preventDefault()
        e.stopPropagation()
        drag.finish(true)
      }}
      className={`bb-touch-drag relative w-[228px] shrink-0 snap-start max-md:w-[168px] ${drag ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {drag && <Handle label={`Move shot ${n}: ${name}`} hint={drag.hint} onNudge={drag.nudge} />}
      <span
        className={`relative block overflow-hidden rounded-[14px] bg-tile transition-[transform,opacity,box-shadow] duration-200 ${aspect} ${held ? 'scale-[1.03] opacity-60 shadow-pop' : ''}`}
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
