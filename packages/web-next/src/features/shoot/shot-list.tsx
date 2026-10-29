'use client'

import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type KeyboardCoordinateGetter,
  type Over,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import * as React from 'react'
import { createPortal } from 'react-dom'

import { Media } from '@/components/media'
import type { BrandId } from '@/data/brands'
import { isMediaRef, referenceById, type IdeaCard, type Shot } from '@/data/ideas'
import { FormatIcon } from '@/features/ideate/idea-parts'

const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const

/** A reel's and a story's frames stand; a carousel's slides are the post's 4:5. */
const ASPECT = { reel: 'aspect-[9/16]', story: 'aspect-[9/16]', carousel: 'aspect-[4/5]' } as const

const refImage = (brandId: BrandId, ref: string) =>
  isMediaRef(ref) ? ref : referenceById(brandId, ref)?.image

/**
 * What each shot of an idea looks like on the sheet, in order: the reference it is shot like;
 * else the next of the idea's own photo and references that no shot uses yet; else nothing, a
 * plain frame. One photo three times down a strip read as a bug.
 */
export function shotImages(brandId: BrandId, card: IdeaCard): Array<string | undefined> {
  const linked = card.shots.flatMap((s) => (s.ref ? (refImage(brandId, s.ref) ?? []) : []))
  const spare = [card.image, ...card.inspiration.map((k) => refImage(brandId, k))].filter(
    (src, i, a): src is string => !!src && a.indexOf(src) === i && !linked.includes(src),
  )
  let next = 0
  return card.shots.map((s) => (s.ref ? refImage(brandId, s.ref) : spare[next++]))
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
const onControl = (target: EventTarget) =>
  !!(target as HTMLElement).closest?.('a, button, .bb-menu')

// ---- The two levels of ids: a group is `g:<ideaId>`, a clip `c:<ideaId>:<shotId>`. Everything
// an item may sort among shares its scope: `g:` for the groups, `c:<ideaId>:` for one group's clips.

const GROUPS = 'g:'
const clipsOf = (ideaId: string) => `c:${ideaId}:`
const groupId = (ideaId: string) => GROUPS + ideaId
const clipId = (ideaId: string, shotId: string) => clipsOf(ideaId) + shotId
/** An id taken apart: its scope, the idea it belongs to, and its own key inside the scope. */
function parse(id: UniqueIdentifier): { scope: string; ideaId: string; key: string } {
  const s = String(id)
  if (s.startsWith(GROUPS)) return { scope: GROUPS, ideaId: s.slice(2), key: s.slice(2) }
  const cut = s.indexOf(':', 2)
  return { scope: s.slice(0, cut + 1), ideaId: s.slice(2, cut), key: s.slice(cut + 1) }
}
const scopeOf = (id: UniqueIdentifier) => parse(id).scope

/** Where an item is held: the drag so far. */
type Held = { active: string; over: string | null }

/** `keys` with the held item moved to where it is held, when both are in this scope. */
function liveOrder(keys: string[], scope: string, held: Held | null): string[] {
  if (!held?.over || scopeOf(held.active) !== scope || scopeOf(held.over) !== scope) return keys
  const from = keys.indexOf(parse(held.active).key)
  const to = keys.indexOf(parse(held.over).key)
  return from < 0 || to < 0 ? keys : arrayMove(keys, from, to)
}

/** A clip's row reaches this far past its clips before the clip is out of its group. */
const SLACK = 24

/**
 * A group lands among the groups and a clip among its own group's clips, the nearest by centre.
 * A clip carried sideways out of its group is over nothing: nothing makes way, and a release puts
 * it back.
 */
const withinScope: CollisionDetection = (args) => {
  const scope = scopeOf(args.active.id)
  const droppableContainers = args.droppableContainers.filter((c) => String(c.id).startsWith(scope))
  if (scope !== GROUPS) {
    const rects = droppableContainers.flatMap((c) => args.droppableRects.get(c.id) ?? [])
    const x = args.collisionRect.left + args.collisionRect.width / 2
    const left = Math.min(...rects.map((r) => r.left)) - SLACK
    const right = Math.max(...rects.map((r) => r.right)) + SLACK
    if (x < left || x > right) return []
  }
  return closestCenter({ ...args, droppableContainers })
}

/**
 * An arrow key moves the lifted item one place along its own row: a group among the groups, a
 * clip among its group's clips. The lifted item's centre goes onto the neighbour's, so that
 * neighbour is what it is over next. Up and down do nothing on a line.
 */
const alongTheLine: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, over, collisionRect, droppableRects, droppableContainers } = context
  if ((event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') || !active || !collisionRect)
    return
  event.preventDefault()
  const scope = scopeOf(active.id)
  const row = droppableContainers
    .getEnabled()
    .filter((c) => String(c.id).startsWith(scope))
    .flatMap((c) => {
      const rect = droppableRects.get(c.id)
      return rect ? [{ id: c.id, rect }] : []
    })
    .sort((a, b) => a.rect.left - b.rect.left)
  const at = row.findIndex((r) => r.id === (over?.id ?? active.id))
  const next = row[at + (event.code === 'ArrowRight' ? 1 : -1)]
  if (!next) return
  return {
    x: next.rect.left + next.rect.width / 2 - collisionRect.width / 2,
    y: next.rect.top + next.rect.height / 2 - collisionRect.height / 2,
  }
}

/** The mouse (and a pen) lifts an item after a few px; a finger goes to the touch sensor. */
class MousePointer extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: e }: React.PointerEvent) =>
        e.isPrimary && e.button === 0 && e.pointerType !== 'touch',
    },
  ]
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
/** How the others make way, and how the lifted copy settles. */
const SLIDE = { duration: 200, easing: EASE }
const SETTLE_MS = 240
/** The lifted item's own box, left behind as a faint copy of itself. */
const GHOST = 0.3
/** How far a lifted group and a lifted clip grow. */
const LIFT = { group: 1.02, clip: 1.04 } as const

/**
 * The copy comes down to size as it lands, and its own box is out of sight while it does, then
 * shows again where it is now.
 */
const settle: DropAnimation = {
  duration: SETTLE_MS,
  easing: EASE,
  sideEffects: (args) => {
    const copy = args.dragOverlay.node.querySelector('[data-lift]')
    if (copy instanceof HTMLElement) {
      copy.animate([{ transform: getComputedStyle(copy).transform }, { transform: 'none' }], {
        duration: SETTLE_MS,
        easing: EASE,
        fill: 'forwards',
      })
    }
    return defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } })(args)
  },
}

const REDUCED = '(prefers-reduced-motion: reduce)'
const onMotion = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const useReducedMotion = () =>
  React.useSyncExternalStore(
    onMotion,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
const noSubscribe = () => () => {}
/** True once on the client: the lifted copy's portal has a body to go to. */
const useMounted = () =>
  React.useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  )

const INSTRUCTIONS = {
  draggable:
    'Press Space to lift it, the left and right arrow keys to move it, Space to drop it, and Escape to put it back.',
}

/**
 * The shot list as one line, like the clips on an editor's timeline: every shot of the shoot side
 * by side in order, numbered on across the ideas as a call sheet counts them, each idea a group
 * under its own label. The line scrolls sideways past the page's edge.
 *
 * With `onReorderIdeas` a group drags by its label to another place among the ideas; with
 * `onReorder` a clip drags to another place inside its group, never out of it. A lifted copy
 * follows the pointer (`@dnd-kit`: a mouse after a few px, a finger after a short press, or the
 * keyboard from the item's handle), its own box waits as a faint ghost, and the others slide
 * aside along the line. `ideaHref` links each label to the idea's page; the public page leaves
 * it out, and `onRemoveIdea` gives each label Remove.
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
  const canDrag = Boolean(onReorder || onReorderIdeas)
  const still = useReducedMotion()
  const mounted = useMounted()
  // dnd-kit names its hidden instructions after this; a counter would differ from the server's.
  const id = React.useId()
  const [held, setHeld] = React.useState<Held | null>(null)
  const sensors = useSensors(
    useSensor(MousePointer, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: alongTheLine }),
  )
  const ids = ideas.map((i) => i.id)
  const [strip, more] = useMoreRight()
  // The numbers follow the drag: the lifted item counts where it is held.
  const starts = startsOf(liveOrder(ids, GROUPS, held), ideas)

  // The cursor says what a release would do; the copy under it takes no events of its own.
  React.useEffect(() => {
    if (!held) return
    const blocked = scopeOf(held.active) !== GROUPS && !held.over
    document.body.style.cursor = blocked ? 'not-allowed' : 'grabbing'
    return () => {
      document.body.style.cursor = ''
    }
  }, [held])

  // A drag's first "over" is the item's own place: that is no move, and nothing is said of it.
  const moved = React.useRef(false)
  const start = ({ active }: DragStartEvent) => {
    moved.current = false
    setHeld({ active: String(active.id), over: String(active.id) })
  }
  const over = ({ active, over }: DragOverEvent) => {
    if (over?.id !== active.id) moved.current = true
    setHeld({ active: String(active.id), over: over ? String(over.id) : null })
  }
  const cancel = () => setHeld(null)
  const end = ({ active, over }: DragEndEvent) => {
    setHeld(null)
    if (!over || over.id === active.id) return
    const from = parse(active.id)
    const to = parse(over.id)
    if (from.scope !== to.scope) return
    if (from.scope === GROUPS) {
      onReorderIdeas?.(arrayMove(ids, ids.indexOf(from.key), ids.indexOf(to.key)))
      return
    }
    const shotIds = ideas.find((i) => i.id === from.ideaId)?.shots.map((s) => s.id) ?? []
    onReorder?.(from.ideaId, arrayMove(shotIds, shotIds.indexOf(from.key), shotIds.indexOf(to.key)))
  }

  /** What a screen reader calls an item: the group by its hook, a clip by its number and name. */
  const nameOf = (id: UniqueIdentifier) => {
    const { scope, ideaId, key } = parse(id)
    const card = ideas.find((i) => i.id === ideaId)
    if (!card) return 'the item'
    if (scope === GROUPS) return `group: ${card.hook}`
    const at = card.shots.findIndex((s) => s.id === key)
    return `shot ${(starts.get(card.id) ?? 0) + at + 1}: ${card.shots[at]?.title || 'Untitled shot'}`
  }
  const slotOf = (over: Over) => `position ${(over.data.current?.sortable?.index ?? 0) + 1}`
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ over }) =>
      !over ? 'Over no place it can go.' : moved.current ? `Moved to ${slotOf(over)}.` : undefined,
    onDragEnd: ({ over }) => (over ? `Dropped at ${slotOf(over)}.` : 'Dropped. Nothing changed.'),
    onDragCancel: ({ active }) => `Put back ${nameOf(active.id)}.`,
  }

  const line = (
    <div
      ref={strip}
      // More past the right edge: the edge fades, which says the line goes on (a phone shows
      // no scroll bar).
      style={
        more
          ? {
              maskImage: 'linear-gradient(to right, #000 calc(100% - 48px), transparent)',
              WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 48px), transparent)',
            }
          : undefined
      }
      className={`overflow-x-auto pt-1 pb-2 [scrollbar-width:none] ${bleed}`}
    >
      <SortableContext items={ids.map(groupId)} strategy={horizontalListSortingStrategy}>
        <ol
          aria-label="Shots in order"
          // Read only (the share page), the ideas wrap to new rows: a strip cut at the edge
          // with nothing to drag it by read as broken.
          className={`flex items-start gap-7 max-md:gap-4 ${canDrag ? 'w-max min-w-full' : 'flex-wrap gap-y-8 max-md:gap-y-6'}`}
        >
          {ideas.map((card) => (
            <Group
              key={card.id}
              brandId={brandId}
              card={card}
              start={starts.get(card.id) ?? 0}
              order={liveOrder(
                card.shots.map((s) => s.id),
                clipsOf(card.id),
                held,
              )}
              label={headings}
              href={ideaHref?.(card.id)}
              still={still}
              sortable={Boolean(onReorderIdeas)}
              clipsSortable={Boolean(onReorder)}
              onRemove={onRemoveIdea ? () => onRemoveIdea(card.id) : undefined}
            />
          ))}
        </ol>
      </SortableContext>
    </div>
  )
  if (!canDrag) return line

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={withinScope}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ threshold: { x: 0.12, y: 0.12 } }}
      accessibility={{ announcements, screenReaderInstructions: INSTRUCTIONS }}
      onDragStart={start}
      onDragOver={over}
      onDragEnd={end}
      onDragCancel={cancel}
    >
      {line}
      {mounted &&
        createPortal(
          <DragOverlay zIndex={80} dropAnimation={still ? null : settle}>
            {held && (
              <Lifted
                id={held.active}
                brandId={brandId}
                ideas={ideas}
                starts={starts}
                label={headings}
                still={still}
              />
            )}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  )
}

/**
 * The copy that travels with the pointer: the group with its label, bar and clips, or the one
 * clip, on a pale card a little larger than itself. It rises as it lifts and comes down as it
 * lands (`settle`); under reduced motion it neither grows nor animates.
 */
function Lifted({
  id,
  brandId,
  ideas,
  starts,
  label,
  still,
}: {
  id: string
  brandId: BrandId
  ideas: IdeaCard[]
  starts: Map<string, number>
  label: boolean
  still: boolean
}) {
  const { scope, ideaId, key } = parse(id)
  const group = scope === GROUPS
  const card = ideas.find((i) => i.id === ideaId)
  if (!card) return null
  const start = starts.get(card.id) ?? 0
  const at = group ? -1 : card.shots.findIndex((s) => s.id === key)
  const shot = card.shots[at]
  const images = shotImages(brandId, card)
  return (
    // The outer box is the item's exact size: dnd-kit measures it for the hit test and the landing.
    <div aria-hidden="true" className="relative h-full w-full">
      <div
        data-lift=""
        className={`absolute -inset-2 rounded-[14px] bg-page p-2 shadow-pop ${still ? '' : 'bb-lift'}`}
        style={{ transform: still ? undefined : `scale(${group ? LIFT.group : LIFT.clip})` }}
      >
        {group ? (
          <div className="flex flex-col gap-2">
            {label && <Label card={card} held />}
            <ol className="flex gap-1.5">
              {card.shots.map((s, i) => (
                <li key={s.id} className={CLIP}>
                  <FrameBody
                    shot={s}
                    src={images[i]}
                    aspect={ASPECT[card.format]}
                    n={start + i + 1}
                  />
                </li>
              ))}
            </ol>
          </div>
        ) : (
          shot && (
            <div className="flex flex-col gap-1.5">
              <FrameBody
                shot={shot}
                src={images[at]}
                aspect={ASPECT[card.format]}
                n={start + at + 1}
              />
            </div>
          )
        )}
      </div>
    </div>
  )
}

/**
 * One idea on the line: its label, then its clips in their own sortable row. The label is the
 * group's grip; the clips sort among themselves and never leave the group.
 */
function Group({
  brandId,
  card,
  start,
  order,
  label,
  href,
  still,
  sortable,
  clipsSortable,
  onRemove,
}: {
  brandId: BrandId
  card: IdeaCard
  start: number
  /** The shots' ids as the drag has them so far, for the numbers. */
  order: string[]
  label: boolean
  href?: string
  still: boolean
  sortable: boolean
  clipsSortable: boolean
  onRemove?: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: groupId(card.id), disabled: !sortable, transition: still ? null : SLIDE })
  // Remove shows on hover of the label; a finger gets it from a small "…" beside the format.
  const [more, setMore] = React.useState(false)
  const images = shotImages(brandId, card)
  const remove = onRemove && (
    <>
      <button
        type="button"
        aria-label={`Remove ${card.hook}`}
        onClick={onRemove}
        className={`ml-auto shrink-0 text-[13px] text-ink-4 hover:text-ink [@media(hover:none)]:hidden ${ON_HOVER}`}
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
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? GHOST : undefined,
      }}
      className="flex shrink-0 flex-col gap-2"
    >
      {label && (
        <Label
          card={card}
          href={href}
          held={isDragging}
          grab={sortable ? listeners : undefined}
          grip={
            sortable && (
              <Grip
                label={`Move group: ${card.hook}`}
                refFn={setActivatorNodeRef}
                attributes={attributes}
                onKeyDown={(e) => listeners?.onKeyDown?.(e)}
              />
            )
          }
        >
          {remove}
        </Label>
      )}
      {card.shots.length === 0 ? (
        <p className="text-[13px] text-ink-4">No storyboard yet.</p>
      ) : (
        <SortableContext
          items={card.shots.map((s) => clipId(card.id, s.id))}
          strategy={horizontalListSortingStrategy}
        >
          <ol aria-label={`Shots of ${card.hook}`} className="flex gap-1.5">
            {card.shots.map((shot, i) => (
              <Frame
                key={shot.id}
                id={clipId(card.id, shot.id)}
                shot={shot}
                src={images[i]}
                aspect={ASPECT[card.format]}
                n={start + order.indexOf(shot.id) + 1}
                still={still}
                sortable={clipsSortable}
              />
            ))}
          </ol>
        </SortableContext>
      )}
    </li>
  )
}

type Listeners = ReturnType<typeof useSortable>['listeners']

/**
 * A group's label: its hook, its format, and the clip bar that spans its clips and deepens under
 * the pointer or a drag. With `grab` a press on it (not on a control in it) lifts the group.
 */
function Label({
  card,
  href,
  held,
  grab,
  grip,
  children,
}: {
  card: IdeaCard
  href?: string
  held: boolean
  grab?: Listeners
  /** The keyboard's handle, first in the tab order. */
  grip?: React.ReactNode
  children?: React.ReactNode
}) {
  const hook = href ? (
    <Link href={href} draggable={false} className="truncate hover:underline">
      {card.hook}
    </Link>
  ) : (
    <h3 className="truncate">{card.hook}</h3>
  )
  return (
    <div
      onPointerDown={(e) => {
        if (grab && !onControl(e.target)) grab.onPointerDown?.(e)
      }}
      onTouchStart={(e) => {
        if (grab && !onControl(e.target)) grab.onTouchStart?.(e)
      }}
      className={`group/label bb-touch-drag relative flex w-full min-w-0 flex-col gap-2 pb-1 text-[13px] font-medium select-none ${grab ? 'cursor-grab touch-manipulation' : ''}`}
    >
      {grip}
      <span className="flex min-w-0 items-center gap-2 px-0.5">
        {hook}
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-normal text-ink-4">
          <FormatIcon format={card.format} size={9} />
          {FORMAT_LABEL[card.format]}
        </span>
        {children}
      </span>
      <span
        className={`h-[3px] w-full rounded-full transition-colors duration-200 ${held ? 'bg-(--layer-shoot-ink)' : 'bg-(--layer-shoot) group-hover/label:bg-(--layer-shoot-ink)'}`}
      />
    </div>
  )
}

const CLIP = 'relative flex w-[152px] shrink-0 flex-col gap-1.5 select-none max-md:w-[108px]'

/** One clip on the line, sortable among its group's. */
function Frame({
  id,
  shot,
  src,
  aspect,
  n,
  still,
  sortable,
}: {
  id: string
  shot: Shot
  src?: string
  aspect: string
  n: number
  still: boolean
  sortable: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !sortable, transition: still ? null : SLIDE })
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? GHOST : undefined,
      }}
      onPointerDown={(e) => sortable && listeners?.onPointerDown?.(e)}
      onTouchStart={(e) => sortable && listeners?.onTouchStart?.(e)}
      className={`group/clip bb-touch-drag ${CLIP} ${sortable ? 'cursor-grab touch-manipulation' : ''}`}
    >
      {sortable && (
        <Grip
          label={`Move shot ${n}: ${shot.title || 'Untitled shot'}`}
          refFn={setActivatorNodeRef}
          attributes={attributes}
          onKeyDown={(e) => listeners?.onKeyDown?.(e)}
        />
      )}
      <FrameBody shot={shot} src={src} aspect={aspect} n={n} hover={sortable} />
    </li>
  )
}

/** A clip's picture, then its number and its name under it. */
function FrameBody({
  shot,
  src,
  aspect,
  n,
  hover,
}: {
  shot: Shot
  src?: string
  aspect: string
  n: number
  /** It rises a little under the pointer, where it can be dragged. */
  hover?: boolean
}) {
  return (
    <>
      <span
        className={`relative block overflow-hidden rounded-[10px] bg-tile transition-[transform,box-shadow] duration-200 ${aspect} after:pointer-events-none after:absolute after:inset-0 after:rounded-[10px] after:shadow-[inset_0_0_0_1px_rgba(18,18,18,0.07)] after:content-[''] group-focus-within/clip:shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)] ${hover ? 'group-hover/clip:-translate-y-0.5 group-hover/clip:shadow-soft' : ''}`}
      >
        {src && <Media src={src} sizes="(max-width: 768px) 108px, 152px" />}
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5 px-0.5">
        <span className="text-[12px] text-ink-4 tabular-nums">{String(n).padStart(2, '0')}</span>
        <span className="min-w-0 text-[13px] leading-snug break-words text-ink-2">
          {shot.title || 'Untitled shot'}
        </span>
      </span>
    </>
  )
}

/**
 * The keyboard's grip on a group or a clip: out of sight until it has the focus, when it shows as
 * a small mark in the corner. Space lifts, the arrow keys move, Space drops, Escape puts it back
 * (the keyboard sensor); the pointer's drag is the item's own.
 */
function Grip({
  label,
  refFn,
  attributes,
  onKeyDown,
}: {
  label: string
  refFn: (el: HTMLElement | null) => void
  attributes: ReturnType<typeof useSortable>['attributes']
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  return (
    <button
      type="button"
      ref={refFn}
      aria-label={label}
      {...attributes}
      onKeyDown={onKeyDown}
      className="sr-only top-2 left-2 z-10 rounded-full bg-page text-ink-3 shadow-soft focus-visible:not-sr-only focus-visible:absolute focus-visible:flex focus-visible:size-7 focus-visible:items-center focus-visible:justify-center focus-visible:outline-none"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <circle cx="3" cy="2" r="1" />
        <circle cx="7" cy="2" r="1" />
        <circle cx="3" cy="5" r="1" />
        <circle cx="7" cy="5" r="1" />
        <circle cx="3" cy="8" r="1" />
        <circle cx="7" cy="8" r="1" />
      </svg>
    </button>
  )
}

/** A scrolling row's ref, and whether more of it lies past its right edge. */
function useMoreRight(): [(el: HTMLDivElement | null) => void, boolean] {
  const [el, setEl] = React.useState<HTMLDivElement | null>(null)
  const [more, setMore] = React.useState(false)
  React.useEffect(() => {
    if (!el) return
    const measure = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const resize = new ResizeObserver(measure)
    resize.observe(el)
    if (el.firstElementChild) resize.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', measure)
      resize.disconnect()
    }
  }, [el])
  return [setEl, more]
}

/** How many shots the ideas hold together. */
export const shotCount = (ideas: IdeaCard[]) => ideas.reduce((n, i) => n + i.shots.length, 0)
