'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { CheckIcon, CloseIcon, SparkIcon } from '@/components/icons'
import { fromFile, Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { startTouchDrag, touchDragPending } from '@/components/touch-drag'
import { usePhone } from '@/components/use-phone'
import type { BrandId } from '@/data/brands'
import type { Day, Stage, Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import {
  isMediaRef,
  newShot,
  referenceById,
  referencesOf,
  type IdeaCard,
  type IdeaStatus,
  type Reference,
  type Shot,
} from '@/data/ideas'
import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { storyTaken } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'

import { dayLabel, landingDay } from './calendar-slot'
import { DayPicker, type DayInfo } from './day-picker'
import {
  CHIPS,
  EYEBROW,
  FormatIcon,
  STATUS_LABEL,
  statusColour,
  useSlots,
  type Slot,
  useRename,
} from './idea-parts'
import { editIdea, keepSuggestion, setDay, skipSuggestion, type IdeaEdit } from './ideas-store'
import { useSortable, type Sortable } from './sortable'

const HAIR = 'border-(--cal-line)'
const TIMES = ['08:00', '12:00', '15:00', '18:00', '19:30', '21:00']
const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const
/** A carousel takes ten slides at most, as the composer says. */
const SLIDES_MAX = 10
/** Where Back goes: the overview, not the moodboard the ideas page opens on. */
export const IDEAS_HREF = '/ideate?view=ideas'
/** The ring a tile or a card wears while something is held over it. */
const OVER = 'shadow-[inset_0_0_0_1.5px_var(--ink)]'
/** The faint ring every target wears while a file is somewhere over the page. */
const CAN_TAKE = 'shadow-[inset_0_0_0_1px_var(--cal-ghost)]'
/** Controls that show on hover or focus, and always under a finger. */
const HOVER =
  'opacity-0 transition-opacity focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
const QUIET = 'text-[12.5px] text-ink-3 transition-colors hover:text-ink'
const SIZES = '(max-width: 768px) 50vw, 240px'
/**
 * The lifted item: a touch lighter, a touch larger, with a shadow. It goes on a wrapper inside
 * the dragged node, never on the node itself: a transform on the drag's source ends the drag, and
 * so does an entrance animation that is still applied, which is why `bb-rise` sits there too.
 */
const LIFTED = 'scale-[1.03] opacity-60 shadow-pop'
const LIFTABLE = 'transition-[transform,opacity,box-shadow] duration-200'

type Step = (typeof CHIPS)[number]

/** The step a card is at: an idea until it has a post, then the post's stage (a failed post was scheduled). */
function stepOf(status: IdeaStatus): Step {
  if (status === 'failed') return 'scheduled'
  return status === 'suggested' ? 'idea' : status
}

/**
 * One idea's own page (`/ideate/<id>`): the production document for one reel, carousel or
 * story, from "we saw something we liked" to "it is live". The work runs in four stages, and the
 * page is built in that order: References (what it should look like), Shots (the storyboard and
 * the shoot day), Shoot (what was captured on the day) and Post (status, date and time, which
 * make it a post on the calendar). A rail at the top shows where the idea stands; every stage
 * is open at any time. Back returns to Current ideas.
 *
 * The page belongs to the brand in the header. An idea of another brand, or one a reload lost,
 * is not shown.
 */
export function IdeaPage({ id }: { id: string }) {
  // A suggestion's page opens from the calendar too, before anyone pressed Suggest.
  const slot = useSlots(true).find((s) => s.card.id === id)
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1440px] px-10 pb-24 max-md:px-4 max-md:pt-2 max-md:pb-[calc(96px+env(safe-area-inset-bottom))]">
        <div className="pb-6 max-md:pb-5">
          <Link
            href={IDEAS_HREF}
            className="inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase transition-colors hover:text-ink"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M9.5 6h-7M5.5 3l-3 3 3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Current ideas
          </Link>
        </div>
        {slot ? (
          <Idea key={id} slot={slot} />
        ) : (
          <p className="text-[15px] text-ink-3">
            This idea is not here: it belongs to another brand, or a reload started the demo over.
          </p>
        )}
      </main>
    </div>
  )
}

// ── The plan ─────────────────────────────────────────────────────────────────────────────────

/** The days ahead a post can take; a story cannot share its row with another story. */
function daysAhead(weeks: Week[], card: IdeaCard) {
  const ahead = new Map<string, DayInfo & { taken: boolean }>()
  for (const d of weeks.flatMap((w) => w.days)) {
    if (d.past || d.today) continue
    // Other posts on the day; this idea's own post does not count.
    const posts = feedsOf(d).filter((m) => m.kind === 'post' && m.postId !== card.postId).length
    const taken = card.format === 'story' && storyTaken(weeks, d.n, card.postId)
    const note = taken
      ? 'story planned'
      : posts
        ? `${posts} post${posts > 1 ? 's' : ''}`
        : undefined
    ahead.set(d.n, { taken, disabled: taken, dot: posts > 0 || taken, note })
  }
  return ahead
}

interface Plan {
  time: string
  /** What the picker says of a day: ahead or not, taken, how many posts it holds. */
  infoOf: (day: Day) => DayInfo
  /** What the post carries, in order. */
  media: string[]
  /** How many of those the shoot captured (the slides of a carousel, the frames of a story). */
  fromShoot: number
  setStatus: (step: Step) => void
  setDate: (dayN: string) => void
  setTime: (time: string) => void
}

/** What the shoot captured, in shot order. */
const capturedOf = (shots: Shot[]) => shots.flatMap((s) => (s.media ? [s.media] : []))

const sameMedia = (a: string[], b: string[]) =>
  a.length === b.length && a.every((m, i) => m === b[i])

/**
 * What the shoot hands the post, or null while it has nothing to hand: a reel's final cut (its
 * clips are footage, not the post), a carousel's captured slides, a story's captured frames.
 */
function handedBy(card: IdeaCard): string[] | null {
  if (card.format === 'reel') return card.cut ? [card.cut] : null
  const captured = capturedOf(card.shots)
  const media = card.format === 'carousel' ? captured.slice(0, SLIDES_MAX) : captured
  return media.length > 0 ? media : null
}

/**
 * The card's plan. A date puts the idea's tile on that day; a status makes it a post there (or on
 * the first free day), and a new date or time moves the post.
 * The post carries the idea's own media only: a reference photo is somebody else's picture.
 * Once the shoot has something to hand it, the post carries that, and keeps up as more lands.
 */
function usePlan(slot: Slot): Plan {
  const { brand, weeks, byId, planPost, reschedule, setStage, setImages, placeIdea } = useBrand()
  // The time picked before the idea has a date; the post holds it from then on.
  const [picked, setPicked] = React.useState('18:00')
  const { card, dayN } = slot
  const post = card.postId ? byId(card.postId) : undefined
  const time = post?.slot.split(', ')[1] ?? picked
  const ahead = React.useMemo(() => daysAhead(weeks, card), [weeks, card])
  const infoOf = React.useCallback(
    (d: Day): DayInfo => ahead.get(d.n) ?? { disabled: true },
    [ahead],
  )
  const handed = React.useMemo(() => handedBy(card), [card])
  // What the post carried before the shoot took over, to give back if the shoot lets go again
  // (the cut removed, the last slide cleared); the idea's photo when that is not known.
  const before = React.useRef<string[] | null>(null)
  React.useEffect(() => {
    if (!post) return
    if (handed) {
      if (!before.current && !sameMedia(post.images, handed)) before.current = post.images
      setImages(post.id, handed)
    } else if (before.current) {
      setImages(post.id, before.current)
      before.current = null
    } else if (post.images.some((m) => m.startsWith('blob:'))) {
      // A clip the shoot handed earlier, on a page that has since been reopened.
      setImages(post.id, card.image ? [card.image] : [])
    }
  }, [post, handed, card.image, setImages])
  const media = handed ?? post?.images ?? (card.image ? [card.image] : [])
  const firstDay = () => {
    if (dayN && ahead.has(dayN) && !ahead.get(dayN)!.taken) return dayN
    if (card.format === 'story') return [...ahead].find(([, d]) => !d.taken)?.[0] ?? null
    return landingDay(weeks, card.dayN)
  }
  const plan = (stage: Stage, day: string | null, t: string) => {
    if (post) {
      if (day && (day !== dayN || t !== time)) reschedule(post.id, day, t)
      if (stage !== post.stage) setStage(post.id, stage)
      return
    }
    const d = day ?? firstDay()
    if (!d) return
    const id = planPost({ format: card.format, hook: card.hook, images: media }, d, t, stage)
    editIdea(brand.id, card.id, { postId: id })
  }
  return {
    time,
    infoOf,
    media,
    fromShoot: handed && card.format !== 'reel' ? handed.length : 0,
    // "Idea" is where a card starts; once it is a post, the page does not take the post back.
    setStatus: (step) => {
      if (step !== 'idea') plan(step, dayN, time)
    },
    // A date moves a post; an idea without one stays an idea, its tile on the new day.
    setDate: (n) => {
      if (post || card.format === 'story') return plan(post?.stage ?? 'draft', n, time)
      const tile = weeks
        .flatMap((w) => w.days.flatMap(feedsOf))
        .find((m) => m.kind === 'idea' && m.hook === card.hook)
      placeIdea(
        {
          format: card.format,
          hook: card.hook,
          why: tile?.kind === 'idea' ? tile.why : 'Team idea',
        },
        n,
      )
    },
    setTime: (t) => (post && dayN ? reschedule(post.id, dayN, t) : setPicked(t)),
  }
}

// ── The stages ───────────────────────────────────────────────────────────────────────────────

type StageKey = 'references' | 'shots' | 'shoot' | 'post'

interface StageState {
  key: StageKey
  n: string
  label: string
  question: string
  done: boolean
  /** Where it stands, in a few words: "3 of 5 captured". */
  note: string
  current: boolean
}

/** A reference on the page: a saved post, or a file the team added. */
interface Ref {
  key: string
  src: string
  note: string
  /** Whose it is, for a shot that is shot like it: "@sfoglina.bologna", or "your file 2". */
  owner: string
  post: Reference | null
}

function refsOf(brandId: BrandId, card: IdeaCard): Ref[] {
  let files = 0
  return card.inspiration.flatMap((key): Ref[] => {
    if (isMediaRef(key)) {
      return [{ key, src: key, note: 'Added by you', owner: `your file ${++files}`, post: null }]
    }
    const post = referenceById(brandId, key)
    return post?.image
      ? [{ key, src: post.image, note: post.borrow, owner: post.account, post }]
      : []
  })
}

function stagesOf(
  refs: Ref[],
  card: IdeaCard,
  slot: Slot,
  weeks: Week[],
  time: string,
): StageState[] {
  const shots = card.shots
  const captured = shots.filter((s) => s.captured).length
  const shootDay = card.shootDay ? dayLabel(weeks, card.shootDay) : null
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const stages = [
    {
      key: 'references' as const,
      label: 'References',
      question: 'What should it look like?',
      done: refs.length > 0,
      note: refs.length ? plural(refs.length, 'reference') : 'None yet',
    },
    {
      key: 'shots' as const,
      label: 'Shots',
      question: 'How do we shoot it?',
      done: shots.length > 0 && !!shootDay,
      note: shots.length
        ? `${plural(shots.length, 'shot')} · ${shootDay ?? 'no shoot day'}`
        : 'None yet',
    },
    {
      key: 'shoot' as const,
      label: 'Shoot',
      question: 'On the day.',
      done: shots.length > 0 && captured === shots.length,
      note: shots.length ? `${captured} of ${shots.length} captured` : 'Nothing to shoot yet',
    },
    {
      key: 'post' as const,
      label: 'Post',
      question: 'Draft, schedule, publish.',
      done: slot.status === 'posted',
      note: slot.dayN
        ? `${STATUS_LABEL[slot.status]} · ${dayLabel(weeks, slot.dayN)}${card.postId ? `, ${time}` : ''}`
        : STATUS_LABEL[slot.status],
    },
  ]
  // The idea stands at its first unfinished stage; once everything is done, at the last.
  const current = stages.find((s) => !s.done)?.key ?? 'post'
  return stages.map((s, i) => ({ ...s, n: `0${i + 1}`, current: s.key === current }))
}

/** What is being dragged across the page: a reference by its key, or a shot by its id. */
type Drag = { kind: 'ref'; key: string } | { kind: 'shot'; id: string }

/**
 * The drag in flight, what it is over (`ref:<key>`, `shot:<id>`, `files:<where>`), and whether a
 * file from outside is somewhere over the page, when every place it can land shows itself.
 */
interface Board {
  drag: Drag | null
  /** The same drag, readable from a touch drop, whose callbacks were made before it began. */
  held: React.RefObject<Drag | null>
  over: string | null
  files: boolean
  start: (d: Drag) => void
  setOver: (key: string | null) => void
  end: () => void
}

function useBoard(): Board {
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const [over, setOver] = React.useState<string | null>(null)
  const [files, setFiles] = React.useState(false)
  const held = React.useRef<Drag | null>(null)

  // A file dropped between the drop zones would open in the tab, and the demo's memory with it.
  // While a file is over the page, the places it can land show themselves.
  React.useEffect(() => {
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setFiles(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setFiles(false)
    }
    const drop = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
      setFiles(false)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return {
    drag,
    held,
    over,
    files,
    start: (d) => {
      held.current = d
      setDrag(d)
    },
    setOver,
    end: () => {
      held.current = null
      setDrag(null)
      setOver(null)
    },
  }
}

/** True when a drag carries files from outside the page. */
function hasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Lets a drag land: the browser asks on `dragenter` and again on every `dragover`, and refuses the
 * drop unless the last answer was yes. An item that slides under a still pointer is asked once,
 * on `dragenter`, so both get the same answer.
 */
function accept(e: React.DragEvent, when: boolean) {
  if (!when) return false
  e.preventDefault()
  return true
}

/** The photos and videos among dropped or picked files, as media URLs. */
async function mediaFrom(files: FileList | null): Promise<string[]> {
  const media = [...(files ?? [])].filter((f) => /^(image|video)\//.test(f.type))
  return (await Promise.all(media.map(fromFile))).map((d) => d.src)
}

const at = (e: React.DragEvent) => ({ x: e.clientX, y: e.clientY })

/** True when a point is inside an element's box. */
function inside(el: Element | null, p: { x: number; y: number } | null): boolean {
  if (!el || !p) return false
  const r = el.getBoundingClientRect()
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
}

/** Moves an item by the keyboard: Option (Alt) with an arrow key on its handle. */
function nudgeKey(e: React.KeyboardEvent): -1 | 1 | null {
  if (!e.altKey) return null
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return -1
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return 1
  return null
}

/**
 * The keyboard's grip on a tile or a card: out of sight until it has the focus, when it shows as
 * a small mark in the corner. Option with an arrow key moves the item; the drag is the pointer's.
 */
function Handle({
  label,
  hint,
  onNudge,
}: {
  label: string
  hint: string
  onNudge: (by: -1 | 1) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={hint}
      onKeyDown={(e) => {
        const by = nudgeKey(e)
        if (!by) return
        e.preventDefault()
        onNudge(by)
      }}
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

// ── The page ─────────────────────────────────────────────────────────────────────────────────

/**
 * The idea: its words across the top, then the rail, then the four stages down the page, each
 * with its name and question in a column on the left and its work on the right. One drag state
 * serves the whole page, since a reference can be dragged from its stage onto a shot.
 */
function Idea({ slot }: { slot: Slot }) {
  const { brand, weeks } = useBrand()
  const phone = usePhone()
  const plan = usePlan(slot)
  const board = useBoard()
  const { card, status } = slot
  const rename = useRename(card)
  const refs = refsOf(brand.id, card)
  const stages = stagesOf(refs, card, slot, weeks, plan.time)
  const stage = (key: StageKey) => stages.find((s) => s.key === key)!
  // What a keyboard move did, read out once.
  const [said, say] = React.useState('')
  const hint = React.useId()

  const edit = (fields: IdeaEdit | ((c: IdeaCard) => IdeaEdit)) =>
    editIdea(brand.id, card.id, fields)
  const setShots = (shots: Shot[]) => edit({ shots })
  const setRefs = (inspiration: string[]) =>
    edit({
      inspiration,
      // A shot shot like a reference that left the page is shot like nothing.
      shots: card.shots.map((s) =>
        s.ref && !inspiration.includes(s.ref) ? { ...s, ref: undefined } : s,
      ),
    })
  // Writes that follow an await read the card as it is then, not as it was before the wait.
  const addRefs = (keys: string[]) => edit((c) => ({ inspiration: [...c.inspiration, ...keys] }))
  const patchShot = (id: string, fields: Partial<Shot>) =>
    edit((c) => ({ shots: c.shots.map((s) => (s.id === id ? { ...s, ...fields } : s)) }))
  const linkRef = (id: string, key: string | undefined) => patchShot(id, { ref: key })

  const [refSort, attachRefs] = useSortable(
    refs.map((r) => r.key),
    'x',
    // The shown references take their new order; an entry the page cannot show stays in place.
    (keys) =>
      edit((c) => {
        const shown = new Set(keys)
        let i = 0
        return { inspiration: c.inspiration.map((k) => (shown.has(k) ? keys[i++]! : k)) }
      }),
  )
  const [shotSort, attachShots] = useSortable(
    card.shots.map((s) => s.id),
    phone ? 'y' : 'x',
    (ids) => edit((c) => ({ shots: ids.flatMap((id) => c.shots.filter((s) => s.id === id)) })),
  )

  /** A keyboard move, said aloud: "The onions is now 1 of 3". */
  function moved(name: string, list: string[], key: string, by: -1 | 1) {
    const to = list.indexOf(key) + by
    if (to < 0 || to >= list.length) return
    say(`${name} is now ${to + 1} of ${list.length}`)
  }

  return (
    <article className="flex flex-col gap-10 max-md:gap-8">
      <header className="flex max-w-[880px] flex-col gap-4">
        <span className={`${EYEBROW} flex items-center gap-2`}>
          <FormatIcon format={card.format} size={11} />
          {FORMAT_LABEL[card.format]} · {card.pillar}
        </span>
        <textarea
          value={card.hook}
          rows={2}
          onChange={(e) => rename(e.target.value)}
          aria-label="Hook"
          className="w-full resize-none bg-transparent font-display text-[48px] leading-[1.04] tracking-[-0.035em] [field-sizing:content] outline-none max-md:text-[32px]"
        />
        <textarea
          value={card.angle}
          rows={1}
          onChange={(e) => edit({ angle: e.target.value })}
          placeholder="What the shot is, in a sentence."
          aria-label="Note"
          className="w-full max-w-[640px] resize-none bg-transparent text-[16px] leading-[1.5] text-ink-2 [field-sizing:content] outline-none placeholder:text-ink-5"
        />
        {status === 'suggested' && <Suggestion slot={slot} />}
      </header>

      <Rail stages={stages} />
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      <p id={hint} className="sr-only">
        Press Option with an arrow key to move it.
      </p>

      <div className="flex flex-col gap-16 max-md:gap-12">
        <StageSection stage={stage('references')}>
          <References
            card={card}
            refs={refs}
            sort={refSort}
            attach={attachRefs}
            board={board}
            hint={hint}
            onLinkToShot={linkRef}
            onNudge={(key, by) => {
              moved('The reference', refSort.order, key, by)
              refSort.nudge(key, by)
            }}
            setRefs={setRefs}
            addRefs={addRefs}
          />
          <Sharpen card={card} />
        </StageSection>

        <StageSection stage={stage('shots')}>
          <Storyboard
            card={card}
            shots={card.shots}
            refs={refs}
            sort={shotSort}
            attach={attachShots}
            board={board}
            hint={hint}
            setShots={setShots}
            patchShot={patchShot}
            linkRef={linkRef}
            onNudge={(id, by) => {
              const shot = card.shots.find((s) => s.id === id)
              moved(shot?.title || 'The shot', shotSort.order, id, by)
              shotSort.nudge(id, by)
            }}
          />
          <ShotDetails card={card} />
        </StageSection>

        <StageSection stage={stage('shoot')}>
          <Capture card={card} refs={refs} board={board} patchShot={patchShot} />
        </StageSection>

        <StageSection stage={stage('post')}>
          {status === 'suggested' ? (
            <p className="text-[14px] text-ink-4">
              Keep it first: a kept idea takes a status, a date and a time.
            </p>
          ) : (
            <PlanSection slot={slot} plan={plan} board={board} edit={edit} />
          )}
        </StageSection>
      </div>
    </article>
  )
}

/** The four stages in a row that stays at the top: a mark for each, the current one in ink. */
function Rail({ stages }: { stages: StageState[] }) {
  return (
    <nav
      aria-label="Stages"
      className={`sticky top-0 z-10 -mx-10 border-b ${HAIR} bg-page/92 px-10 backdrop-blur-sm max-md:-mx-4 max-md:px-4`}
    >
      <ol className="flex h-12 items-center gap-7 overflow-x-auto max-md:gap-5">
        {stages.map((s) => (
          <li key={s.key} className="shrink-0">
            <a
              href={`#${s.key}`}
              aria-current={s.current ? 'step' : undefined}
              className="flex items-center gap-2 text-[13px] transition-colors hover:text-ink"
            >
              <StageMark done={s.done} current={s.current} />
              <span
                className={
                  s.current ? 'font-medium text-ink' : s.done ? 'text-ink-3' : 'text-ink-4'
                }
              >
                {s.label}
              </span>
              <span className="text-[12px] text-ink-5 max-md:hidden">{s.note}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * A stage's mark: filled once done, ringed with a dot while current, a faint ring ahead. The
 * tick pops in the moment the stage completes.
 */
function StageMark({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span
        key="done"
        className="bb-pop flex size-4 items-center justify-center rounded-full bg-ink text-page"
      >
        <CheckIcon size={8} strokeWidth={2.4} />
      </span>
    )
  }
  return (
    <span
      className={`flex size-4 items-center justify-center rounded-full border transition-colors ${current ? 'border-[1.5px] border-ink' : 'border-(--line-strong)'}`}
    >
      {current && <span className="size-1.5 rounded-full bg-ink" />}
    </span>
  )
}

/** A stage down the page: its number, name, question and standing on the left, its work on the right. */
function StageSection({ stage, children }: { stage: StageState; children: React.ReactNode }) {
  return (
    <section
      id={stage.key}
      aria-label={stage.label}
      className={`grid scroll-mt-14 grid-cols-[200px_minmax(0,1fr)] gap-x-16 gap-y-6 border-t ${HAIR} pt-9 first:border-t-0 first:pt-2 max-lg:grid-cols-1 max-md:pt-7`}
    >
      <div className="flex flex-col gap-1.5">
        <span className={EYEBROW}>{stage.n}</span>
        <h2 className="font-display text-[22px] leading-[1.1] tracking-[-0.02em]">{stage.label}</h2>
        <p className="text-[14px] text-ink-3">{stage.question}</p>
        <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-4">
          <StageMark done={stage.done} current={stage.current} />
          {stage.note}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-10 max-md:gap-8">{children}</div>
    </section>
  )
}

// ── 01 References ────────────────────────────────────────────────────────────────────────────

/**
 * What it should look like: the posts the idea grew from and the files the team added, in
 * order, the first as the main look. Drag a tile to reorder (the others make way as it moves),
 * drag it onto a shot to shoot that shot like it, drop files here to add them, or add a post from
 * the moodboard.
 */
function References({
  card,
  refs,
  sort,
  attach,
  board,
  hint,
  onLinkToShot,
  onNudge,
  setRefs,
  addRefs,
}: {
  card: IdeaCard
  refs: Ref[]
  sort: Sortable
  attach: (el: HTMLElement | null) => void
  board: Board
  hint: string
  onLinkToShot: (shotId: string, key: string) => void
  onNudge: (key: string, by: -1 | 1) => void
  setRefs: (inspiration: string[]) => void
  addRefs: (keys: string[]) => void
}) {
  const { brand } = useBrand()
  const [picking, setPicking] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  const over = board.over === 'files:refs'
  const add = async (files: FileList | null) => addRefs(await mediaFrom(files))
  // The brand's other posts, for the moodboard picker: what is not on the page yet.
  const more = referencesOf(brand.id).filter((r) => r.image && !card.inspiration.includes(r.id))

  return (
    <div
      onDragEnter={(e) => accept(e, hasFiles(e))}
      onDragOver={(e) => {
        if (!accept(e, hasFiles(e))) return
        if (!over) board.setOver('files:refs')
      }}
      onDragLeave={(e) => {
        if (over && !e.currentTarget.contains(e.relatedTarget as Node | null)) board.setOver(null)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        board.end()
        void add(e.dataTransfer.files)
      }}
      className={`-m-3 flex flex-col gap-5 rounded-[18px] p-3 transition-[box-shadow,background-color] ${over ? `bg-(--cal-drop) ${OVER}` : board.files ? CAN_TAKE : ''}`}
    >
      <ol
        ref={attach}
        onDragEnter={(e) => accept(e, board.drag?.kind === 'ref')}
        onDragOver={(e) => accept(e, board.drag?.kind === 'ref')}
        onDrop={(e) => {
          // A drop in a gap between the tiles keeps the order the drag drew.
          if (board.drag?.kind !== 'ref') return
          e.preventDefault()
          sort.end(true)
          board.end()
        }}
        className="grid grid-cols-4 gap-x-3 gap-y-5 max-xl:grid-cols-3 max-md:grid-cols-2"
      >
        {refs.map((r) => (
          <RefTile
            key={r.key}
            r={r}
            index={sort.order.indexOf(r.key)}
            sort={sort}
            board={board}
            hint={hint}
            onLinkToShot={(shotId) => onLinkToShot(shotId, r.key)}
            onNudge={(by) => onNudge(r.key, by)}
            onRemove={() => setRefs(card.inspiration.filter((k) => k !== r.key))}
          />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" onClick={() => input.current?.click()} className={QUIET}>
          {over ? 'Drop to add' : board.files ? 'Drop a file here' : 'Add a file'}
        </button>
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
          className={QUIET}
        >
          {picking ? 'Done' : 'Add from the moodboard'}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        aria-label="Add reference files"
        onChange={(e) => {
          void add(e.target.files)
          e.target.value = ''
        }}
      />
      {picking && (
        <ol
          aria-label="From the moodboard"
          className="bb-rise -mx-3 flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]"
        >
          {more.map((r) => (
            <li key={r.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Add ${r.account}: ${r.borrow}`}
                title={`${r.account} · ${r.borrow}`}
                onClick={() => addRefs([r.id])}
                className="bb-press relative block size-[72px] overflow-hidden rounded-[10px] bg-tile hover:opacity-85"
              >
                <Media src={r.image} sizes="72px" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** One reference: its photo, what to borrow and whose it is; the first is the main look. */
function RefTile({
  r,
  index,
  sort,
  board,
  hint,
  onLinkToShot,
  onNudge,
  onRemove,
}: {
  r: Ref
  index: number
  sort: Sortable
  board: Board
  hint: string
  onLinkToShot: (shotId: string) => void
  onNudge: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const key = `ref:${r.key}`
  const held = sort.dragging === r.key
  const begin = () => {
    sort.start(r.key)
    board.start({ kind: 'ref', key: r.key })
  }
  const finish = (commit: boolean) => {
    sort.end(commit)
    board.end()
  }
  return (
    <li
      data-drop={key}
      data-flip={r.key}
      draggable
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        const list = e.currentTarget.parentElement
        let last: { x: number; y: number } | null = null
        startTouchDrag(e, {
          start: begin,
          over: board.setOver,
          move: (k, p) => {
            last = p
            if (k?.startsWith('ref:')) sort.overAt(k.slice(4), p)
          },
          drop: (k) => {
            // On a shot it is a link, and the order goes back; a lift inside the grid keeps the
            // order it drew (a gap between tiles counts); a lift elsewhere puts it back.
            if (k?.startsWith('shot:')) onLinkToShot(k.slice(5))
            finish(!k?.startsWith('shot:') && inside(list, last))
          },
          end: () => finish(false),
          lift: { selector: '[data-photo]', size: 96 },
        })
      }}
      onDragStart={(e) => {
        if (touchDragPending()) return e.preventDefault()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
        begin()
      }}
      onDragEnd={() => finish(false)}
      onDragEnter={(e) => accept(e, board.drag?.kind === 'ref')}
      onDragOver={(e) => {
        if (!accept(e, board.drag?.kind === 'ref')) return
        e.stopPropagation()
        sort.overAt(r.key, at(e))
      }}
      onDrop={(e) => {
        if (board.drag?.kind !== 'ref') return
        e.preventDefault()
        e.stopPropagation()
        finish(true)
      }}
      // The live order is drawn, not written to the DOM: a moved node would end a finger's drag.
      style={{ order: index }}
      className="group/ref bb-touch-drag relative cursor-grab active:cursor-grabbing"
    >
      <Handle label={`Move reference ${index + 1}: ${r.note}`} hint={hint} onNudge={onNudge} />
      <div
        className={`bb-rise flex flex-col gap-2 rounded-[14px] ${LIFTABLE} ${held ? LIFTED : ''}`}
      >
        <span
          data-photo
          className="relative block aspect-[4/5] overflow-hidden rounded-[14px] bg-tile"
        >
          <Media src={r.src} sizes={SIZES} />
          {index === 0 && (
            <span className="absolute top-2 left-2 rounded-full bg-page/90 px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-ink uppercase">
              Main look
            </span>
          )}
          <button
            type="button"
            aria-label={`Remove reference ${index + 1}`}
            onClick={onRemove}
            className={`absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-page/92 text-ink-3 shadow-soft group-hover/ref:opacity-100 hover:text-ink ${HOVER}`}
          >
            <CloseIcon />
          </button>
        </span>
        <span className="flex flex-col gap-1 px-1">
          <span className="text-[13px] leading-[1.3] text-ink">{r.note}</span>
          {r.post && (
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
              <PlatformLogo platform={r.post.platform} size={10} />
              <span className="truncate">{r.post.account}</span>
            </span>
          )}
        </span>
      </div>
    </li>
  )
}

/** Three stronger hooks; picking one swaps it in, and "Back to mine" restores the team's words. */
function Sharpen({ card }: { card: IdeaCard }) {
  const use = useRename(card)
  // The hook as it was when the page opened, so "Back to mine" has somewhere to go.
  const [mine] = React.useState(card.hook)
  if (card.sharper.length === 0) return null
  const picked = card.sharper.findIndex((s) => s.text === card.hook)

  return (
    <section aria-label="Sharpen the hook" className="flex max-w-[560px] flex-col gap-2">
      <span className="flex items-center justify-between">
        <span className={EYEBROW}>Sharpen the hook</span>
        {picked >= 0 && (
          <button
            type="button"
            onClick={() => use(mine)}
            className="text-[12px] text-ink-3 transition-colors hover:text-ink"
          >
            Back to mine
          </button>
        )}
      </span>
      <div role="radiogroup" aria-label="Sharper hooks" className="flex flex-col gap-1 md:-mx-3">
        {card.sharper.map((s, i) => {
          const on = i === picked
          return (
            <button
              key={s.text}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => use(on ? mine : s.text)}
              className={`flex items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left transition-colors ${on ? 'bg-surface shadow-[inset_0_0_0_1px_var(--ink)]' : 'hover:bg-surface-2'}`}
            >
              <span className="font-display text-[15.5px] leading-[1.2]">{s.text}</span>
              <span className="font-mono text-[9px] tracking-[0.08em] text-ink-5">{s.tag}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── 02 Shots ─────────────────────────────────────────────────────────────────────────────────

/** What one shot is called: a carousel's shots are its slides. */
const unitOf = (card: IdeaCard) => (card.format === 'carousel' ? 'Slide' : 'Shot')

/**
 * The storyboard: the shots in order, each a card with the reference to shoot it like and its
 * line. Drag a card to reorder (the others make way), drag a reference onto a card to shoot it
 * like that (or pick one on the card), drop a file on a card to hand the shot what was captured.
 */
function Storyboard({
  card,
  shots,
  refs,
  sort,
  attach,
  board,
  hint,
  setShots,
  patchShot,
  linkRef,
  onNudge,
}: {
  card: IdeaCard
  shots: Shot[]
  refs: Ref[]
  sort: Sortable
  attach: (el: HTMLElement | null) => void
  board: Board
  hint: string
  setShots: (shots: Shot[]) => void
  patchShot: (id: string, fields: Partial<Shot>) => void
  linkRef: (id: string, key: string | undefined) => void
  onNudge: (id: string, by: -1 | 1) => void
}) {
  const unit = unitOf(card)
  const [fresh, setFresh] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <ol
        ref={attach}
        onDragEnter={(e) => accept(e, board.drag?.kind === 'shot')}
        onDragOver={(e) => accept(e, board.drag?.kind === 'shot')}
        onDrop={(e) => {
          if (board.drag?.kind !== 'shot') return
          e.preventDefault()
          sort.end(true)
          board.end()
        }}
        className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3 max-md:grid-cols-1"
      >
        {shots.map((s) => (
          <ShotCard
            key={s.id}
            shot={s}
            index={sort.order.indexOf(s.id)}
            unit={unit}
            refs={refs}
            sort={sort}
            board={board}
            hint={hint}
            fresh={fresh === s.id}
            onTitle={(title) => patchShot(s.id, { title })}
            onLink={(key) => linkRef(s.id, key)}
            onMedia={(media) => patchShot(s.id, { media, captured: true })}
            onNudge={(by) => onNudge(s.id, by)}
            onRemove={() => setShots(card.shots.filter((o) => o.id !== s.id))}
          />
        ))}
      </ol>
      <button
        type="button"
        onClick={() => {
          const shot = newShot('')
          setFresh(shot.id)
          setShots([...card.shots, shot])
        }}
        className={`self-start ${QUIET}`}
      >
        Add a {unit.toLowerCase()}
      </button>
    </div>
  )
}

function ShotCard({
  shot,
  index,
  unit,
  refs,
  sort,
  board,
  hint,
  fresh,
  onTitle,
  onLink,
  onMedia,
  onNudge,
  onRemove,
}: {
  shot: Shot
  index: number
  unit: string
  refs: Ref[]
  sort: Sortable
  board: Board
  hint: string
  /** Just added: the line takes the cursor. */
  fresh: boolean
  onTitle: (title: string) => void
  onLink: (key: string | undefined) => void
  onMedia: (media: string) => void
  onNudge: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const key = `shot:${shot.id}`
  const [choosing, setChoosing] = React.useState(false)
  const held = sort.dragging === shot.id
  // A reference or a file held over this card.
  const over = board.over === key && !held
  const like = shot.ref ? refs.find((r) => r.key === shot.ref) : undefined
  const n = `${unit} ${index + 1}`
  const line = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    if (fresh) line.current?.focus()
  }, [fresh])
  // The picker takes the focus while open and hands it back to the frame that opened it.
  const frame = React.useRef<HTMLButtonElement>(null)
  const first = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (choosing) first.current?.focus()
  }, [choosing])
  const choose = (k: string | undefined) => {
    if (k !== shot.ref) onLink(k)
    setChoosing(false)
    requestAnimationFrame(() => frame.current?.focus())
  }
  const escape = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    choose(shot.ref)
  }
  const begin = () => {
    sort.start(shot.id)
    board.start({ kind: 'shot', id: shot.id })
  }
  const finish = (commit: boolean) => {
    sort.end(commit)
    board.end()
  }

  return (
    <li
      data-drop={key}
      data-flip={shot.id}
      draggable
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, textarea')) return
        const list = e.currentTarget.parentElement
        let last: { x: number; y: number } | null = null
        startTouchDrag(e, {
          start: begin,
          move: (k, p) => {
            last = p
            if (k?.startsWith('shot:')) sort.overAt(k.slice(5), p)
          },
          // A lift inside the storyboard keeps the order it drew (a gap between cards counts); a
          // lift elsewhere puts it back, as the mouse does.
          drop: () => finish(inside(list, last)),
          end: () => finish(false),
        })
      }}
      onDragStart={(e) => {
        if (touchDragPending()) return e.preventDefault()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
        begin()
      }}
      onDragEnd={() => finish(false)}
      onDragEnter={(e) => accept(e, !!board.drag || hasFiles(e))}
      onDragOver={(e) => {
        // Another shot slides past; a reference or a file lands here; nothing else.
        const { drag } = board
        if (!accept(e, !!drag || hasFiles(e))) return
        if (drag?.kind === 'shot') {
          if (!held) sort.overAt(shot.id, at(e))
          return
        }
        if (board.over !== key) board.setOver(key)
      }}
      onDragLeave={(e) => {
        if (over && !e.currentTarget.contains(e.relatedTarget as Node | null)) board.setOver(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const { drag } = board
        if (hasFiles(e)) void mediaFrom(e.dataTransfer.files).then(([m]) => m && onMedia(m))
        else if (drag?.kind === 'ref') onLink(drag.key)
        if (drag?.kind === 'shot') finish(true)
        else board.end()
      }}
      style={{ order: index }}
      className="group/shot bb-touch-drag relative cursor-grab active:cursor-grabbing"
    >
      <Handle
        label={`Move ${n.toLowerCase()}: ${shot.title || 'untitled'}`}
        hint={hint}
        onNudge={onNudge}
      />
      <div
        className={`bb-rise flex h-full flex-col gap-2.5 rounded-[14px] bg-surface p-2.5 max-md:grid max-md:grid-cols-[96px_minmax(0,1fr)] max-md:items-start ${LIFTABLE} ${held ? LIFTED : ''} ${over ? OVER : board.files ? CAN_TAKE : ''}`}
      >
        <span className="relative block aspect-[4/3] overflow-hidden rounded-[10px] max-md:aspect-[4/5]">
          {choosing ? (
            <span
              role="group"
              aria-label={`A reference for ${n.toLowerCase()}`}
              className="bb-menu absolute inset-0 grid auto-rows-[minmax(44px,1fr)] grid-cols-2 gap-1 overflow-y-auto rounded-[10px] bg-page p-1 shadow-soft"
            >
              {refs.map((r, i) => (
                <button
                  key={r.key}
                  ref={i === 0 ? first : undefined}
                  type="button"
                  aria-label={`Like ${r.owner}`}
                  aria-pressed={r.key === shot.ref}
                  onKeyDown={escape}
                  onClick={() => choose(r.key)}
                  className={`relative overflow-hidden rounded-[6px] bg-tile ${r.key === shot.ref ? OVER : ''}`}
                >
                  <Media src={r.src} sizes="96px" />
                </button>
              ))}
              <button
                type="button"
                ref={refs.length === 0 ? first : undefined}
                aria-pressed={!shot.ref}
                onKeyDown={escape}
                onClick={() => choose(undefined)}
                className={`flex items-center justify-center rounded-[6px] text-[11px] text-ink-4 hover:text-ink ${shot.ref ? 'bg-surface' : OVER}`}
              >
                None
              </button>
            </span>
          ) : like ? (
            <button
              ref={frame}
              type="button"
              aria-label={`Change the reference for ${n.toLowerCase()}`}
              onClick={() => setChoosing(true)}
              className="absolute inset-0 block bg-tile"
            >
              <Media src={like.src} sizes="(max-width: 768px) 96px, 220px" />
            </button>
          ) : (
            <button
              ref={frame}
              type="button"
              aria-label={`Pick a reference for ${n.toLowerCase()}`}
              onClick={() => setChoosing(true)}
              className="group/frame absolute inset-0 flex flex-col items-center justify-center gap-1 outline-none"
            >
              <span
                className={`font-display text-[40px] leading-none tracking-[-0.04em] transition-colors ${over && board.drag?.kind === 'ref' ? 'text-ink' : 'text-ink-5'}`}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span
                className={`text-[11.5px] text-ink-4 group-hover/shot:opacity-100 group-focus-visible/frame:opacity-100 ${HOVER}`}
              >
                {over && board.drag?.kind === 'ref' ? 'Shoot it like this' : 'Shoot it like…'}
              </span>
            </button>
          )}
          {shot.media && !choosing && (
            <span
              key={shot.media}
              className="bb-land absolute right-1.5 bottom-1.5 size-7 overflow-hidden rounded-[6px] shadow-soft ring-2 ring-(--surface)"
            >
              <Media src={shot.media} sizes="28px" />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1 px-0.5 max-md:pt-0.5">
          <span className={`${EYEBROW} flex items-center justify-between`}>
            <span>{n}</span>
            {like && (
              <span className="truncate font-sans normal-case tracking-normal">
                like {like.owner}
              </span>
            )}
          </span>
          <textarea
            value={shot.title}
            ref={line}
            rows={1}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="What is in the frame"
            aria-label={n}
            className="w-full resize-none bg-transparent text-[14px] leading-[1.35] [field-sizing:content] outline-none placeholder:text-ink-5"
          />
        </span>
      </div>
      <button
        type="button"
        aria-label={`Remove ${n.toLowerCase()}`}
        onClick={onRemove}
        className={`absolute top-4 right-4 flex size-6 items-center justify-center rounded-full bg-page/92 text-ink-3 shadow-soft group-hover/shot:opacity-100 hover:text-ink ${HOVER} ${choosing ? 'hidden' : ''}`}
      >
        <CloseIcon />
      </button>
    </li>
  )
}

/** Who or what is in frame, and the shoot day: one of the calendar's shoots, or any day. */
function ShotDetails({ card }: { card: IdeaCard }) {
  const { brand, weeks } = useBrand()
  // The calendar's shoots, in date order; two can share a day.
  const shoots = React.useMemo(
    () =>
      weeks.flatMap((w) =>
        w.events
          .filter((e) => e.layer === 'shoot')
          .flatMap((e) => {
            const day = w.days[e.col - 1]
            return day && !day.past
              ? [
                  {
                    key: `${e.text}:${day.n}`,
                    dayN: day.n,
                    label: `${e.text.replace(/^Shoot · /, '')} · ${dayLabel(weeks, day.n)}`,
                  },
                ]
              : []
          }),
      ),
    [weeks],
  )
  const infoOf = React.useCallback(
    (d: Day): DayInfo => {
      const here = shoots.filter((s) => s.dayN === d.n)
      return { disabled: !!d.past, dot: here.length > 0, note: here.map((s) => s.label).join(', ') }
    },
    [shoots],
  )
  return (
    <div className="grid max-w-[560px] grid-cols-[80px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-[13px]">
      <span className="text-ink-4">In frame</span>
      <input
        value={card.feature}
        onChange={(e) => editIdea(brand.id, card.id, { feature: e.target.value })}
        aria-label="Subject"
        placeholder="The dish, the chef, the room"
        className="w-full bg-transparent text-[14px] outline-none placeholder:text-ink-5"
      />
      <span className="text-ink-4">Shoot day</span>
      <span className="flex">
        <DayPicker
          label="Shoot day"
          value={card.shootDay ?? null}
          placeholder="Pick a shoot day"
          onChange={(shootDay) => editIdea(brand.id, card.id, { shootDay })}
          onClear={() => editIdea(brand.id, card.id, { shootDay: undefined })}
          infoOf={infoOf}
          shortcuts={shoots}
        />
      </span>
    </div>
  )
}

// ── 03 Shoot ─────────────────────────────────────────────────────────────────────────────────

/**
 * On the day: the storyboard as a strip that fills in as frames are captured, then the shots as
 * a list to tick, each taking the photo or clip it became. Drop a file on a line, or Add.
 */
function Capture({
  card,
  refs,
  board,
  patchShot,
}: {
  card: IdeaCard
  refs: Ref[]
  board: Board
  patchShot: (id: string, fields: Partial<Shot>) => void
}) {
  const { weeks } = useBrand()
  const shootDay = card.shootDay ? dayLabel(weeks, card.shootDay) : null
  const unit = unitOf(card)

  if (card.shots.length === 0) {
    return <p className="text-[14px] text-ink-4">Add shots to the storyboard first.</p>
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Strip
          label="The storyboard, as captured"
          frames={card.shots.map((s) => ({
            key: s.id,
            src: s.media,
            done: !!s.captured,
            title: s.title || unit,
          }))}
          tall
        />
        <p className="text-[13px] text-ink-4">
          {shootDay ? `Shooting ${shootDay}.` : 'No shoot day yet: pick one under Shots.'}
        </p>
      </div>
      <ol className="flex flex-col">
        {card.shots.map((s, i) => {
          const key = `files:capture:${s.id}`
          const over = board.over === key
          const like = s.ref ? refs.find((r) => r.key === s.ref) : undefined
          const title = s.title || `${unit} ${i + 1}`
          return (
            <li
              key={s.id}
              onDragEnter={(e) => accept(e, hasFiles(e))}
              onDragOver={(e) => {
                if (!accept(e, hasFiles(e))) return
                if (board.over !== key) board.setOver(key)
              }}
              onDragLeave={(e) => {
                if (over && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  board.setOver(null)
                }
              }}
              onDrop={(e) => {
                if (!hasFiles(e)) return
                e.preventDefault()
                board.end()
                void mediaFrom(e.dataTransfer.files).then(
                  ([m]) => m && patchShot(s.id, { media: m, captured: true }),
                )
              }}
              className={`group/row -mx-3 grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-4 rounded-[12px] px-3 py-2.5 transition-[box-shadow,background-color] ${over ? `bg-(--cal-drop) ${OVER}` : board.files ? CAN_TAKE : ''}`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={!!s.captured}
                aria-label={`Captured: ${title}`}
                onClick={() => patchShot(s.id, { captured: !s.captured })}
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${s.captured ? 'border-(--insight-5) bg-(--insight-5) text-page' : 'border-(--line-strong) hover:border-ink-3'}`}
              >
                {s.captured && (
                  <span key="on" className="bb-pop flex">
                    <CheckIcon size={9} strokeWidth={2.4} />
                  </span>
                )}
              </button>
              <span className="flex min-w-0 flex-col">
                <span
                  className={`truncate text-[15px] transition-colors ${s.captured ? 'text-ink-4' : 'text-ink'}`}
                >
                  {title}
                </span>
                {like && <span className="text-[12px] text-ink-4">like {like.owner}</span>}
              </span>
              <MediaSlot
                media={s.media}
                label={title}
                over={over}
                files={board.files}
                onMedia={(media) => patchShot(s.id, { media, captured: true })}
                onClear={() => patchShot(s.id, { media: undefined })}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** A shot's photo or clip: the thumbnail once it is here, else a quiet Add on hover. */
function MediaSlot({
  media,
  label,
  over,
  files,
  onMedia,
  onClear,
}: {
  media: string | undefined
  label: string
  over: boolean
  files: boolean
  onMedia: (media: string) => void
  onClear: () => void
}) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <span className="group/media relative flex h-12 items-center">
      {media ? (
        <>
          <span
            key={media}
            className="bb-land relative block size-12 overflow-hidden rounded-[8px] bg-tile"
          >
            <Media src={media} sizes="48px" />
          </span>
          <button
            type="button"
            aria-label={`Remove the clip for: ${label}`}
            onClick={onClear}
            className={`absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-page text-ink-3 shadow-soft group-hover/media:opacity-100 hover:text-ink ${HOVER}`}
          >
            <CloseIcon />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`text-[12.5px] transition-[opacity,color] hover:text-ink ${over ? 'text-ink' : files ? 'text-ink-3' : `text-ink-4 group-hover/row:opacity-100 ${HOVER}`}`}
        >
          {over ? 'Drop it here' : files ? 'Drop here' : 'Add the clip'}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        hidden
        aria-label={`Add the clip for: ${label}`}
        onChange={(e) => {
          void mediaFrom(e.target.files).then(([m]) => m && onMedia(m))
          e.target.value = ''
        }}
      />
    </span>
  )
}

/**
 * Frames in a row: the storyboard filling in as the shoot captures it, or the media a post
 * carries, in order. A reel's or a story's frames stand tall, a carousel's square.
 */
function Strip({
  label,
  frames,
  tall,
}: {
  label: string
  frames: Array<{ key: string; src?: string; done?: boolean; title: string }>
  tall: boolean
}) {
  return (
    <ol aria-label={label} className="flex flex-wrap gap-1.5">
      {frames.map((f, i) => (
        <li
          key={f.key}
          title={f.title}
          className={`relative overflow-hidden rounded-[6px] bg-surface-2 ring-1 ring-(--cal-line) transition-colors ${tall ? 'h-14 w-9' : 'size-12'}`}
        >
          {f.src ? (
            <span key={f.src} className="bb-land absolute inset-0">
              <Media src={f.src} sizes="56px" />
            </span>
          ) : f.done ? (
            <span className="absolute inset-0 flex items-center justify-center text-(--insight-5)">
              <CheckIcon size={10} strokeWidth={2.2} />
            </span>
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] text-ink-5">
              {i + 1}
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

// ── 04 Post ──────────────────────────────────────────────────────────────────────────────────

/** Status, date and time, where the idea stands on the calendar, and what the post carries. */
function PlanSection({
  slot,
  plan,
  board,
  edit,
}: {
  slot: Slot
  plan: Plan
  board: Board
  edit: (fields: IdeaEdit | ((c: IdeaCard) => IdeaEdit)) => void
}) {
  const { brand, weeks } = useBrand()
  const { card, status, dayN } = slot
  const step = stepOf(status)
  const { media, fromShoot } = plan
  const reel = card.format === 'reel'
  const footage = capturedOf(card.shots)
  const carries = reel
    ? card.cut
      ? 'The final cut.'
      : `${card.postId && media.length ? "The post's media" : media.length ? 'Your photo' : 'Nothing yet'}, until the final cut lands.`
    : fromShoot > 0
      ? `${fromShoot} from the shoot, in shot order.`
      : media.length > 0
        ? `${card.postId ? "The post's media" : 'Your photo'}. What the shoot captures takes its place, in shot order.`
        : 'Nothing yet. What the shoot captures lands here, in shot order.'

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Plan" className="flex flex-col gap-3">
        <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 text-[13px]">
          <span className="pt-1.5 text-ink-4">Status</span>
          <StatusPicker value={step} onChange={plan.setStatus} />
          <span className="pt-1.5 text-ink-4">Post</span>
          <span className="flex flex-wrap items-center gap-2">
            <DayPicker
              label="Post date"
              value={dayN}
              placeholder="Pick a day and a time"
              disabled={step === 'posted'}
              onChange={plan.setDate}
              infoOf={plan.infoOf}
              time={plan.time}
              times={TIMES}
              best={INSIGHTS_BY_BRAND[brand.id].best}
              onTime={plan.setTime}
            />
          </span>
        </div>
        <span className="pl-[92px] text-[12px] text-ink-4">
          {card.postId && dayN ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href="/" className="text-(--insight-6) hover:underline">
                On the calendar · {dayLabel(weeks, dayN)}, {plan.time}
                {card.format === 'story' ? ' · story row' : ''}
              </Link>
              <Link
                href={`/post/${card.postId}`}
                className="font-medium text-ink underline-offset-2 hover:underline"
              >
                Open in scheduler →
              </Link>
            </span>
          ) : dayN ? (
            'An idea tile on the calendar. A status makes it a post.'
          ) : (
            'Not on the calendar. Pick a date, or a status takes the first free day.'
          )}
        </span>
      </section>
      {reel && <FinalCut card={card} board={board} edit={edit} />}
      <section aria-label="Media" className="flex flex-col gap-2.5">
        <span className={`${EYEBROW} flex items-center gap-2`}>
          The post carries
          <span className="text-ink-5 tabular-nums">{media.length}</span>
        </span>
        {media.length > 0 && (
          <Strip
            label="What the post carries"
            frames={media.map((m, i) => ({ key: m, src: m, title: `${i + 1}` }))}
            tall={card.format !== 'carousel'}
          />
        )}
        <span className="text-[12px] text-ink-4">{carries}</span>
      </section>
      {reel && footage.length > 0 && (
        <section aria-label="Footage" className="flex flex-col gap-2.5">
          <span className={`${EYEBROW} flex items-center gap-2`}>
            Footage
            <span className="text-ink-5 tabular-nums">{footage.length}</span>
          </span>
          <Strip
            label="The shoot's clips"
            frames={footage.map((m, i) => ({ key: m, src: m, title: `Clip ${i + 1}` }))}
            tall
          />
          <span className="text-[12px] text-ink-4">
            {footage.length === 1 ? 'One clip' : `${footage.length} clips`} from the shoot, in shot
            order: what the final cut is made from.
          </span>
        </section>
      )}
    </div>
  )
}

/**
 * A reel's final cut: the one video that goes out. Drop it here or Add it; the post carries it
 * from then on, and the shoot's clips stay as footage.
 */
function FinalCut({
  card,
  board,
  edit,
}: {
  card: IdeaCard
  board: Board
  edit: (fields: IdeaEdit) => void
}) {
  const input = React.useRef<HTMLInputElement>(null)
  const key = 'files:cut'
  const over = board.over === key
  const take = (files: FileList | null) =>
    void mediaFrom(files).then(([m]) => m && edit({ cut: m }))

  return (
    <section
      aria-label="Final cut"
      onDragEnter={(e) => accept(e, hasFiles(e))}
      onDragOver={(e) => {
        if (!accept(e, hasFiles(e))) return
        if (!over) board.setOver(key)
      }}
      onDragLeave={(e) => {
        if (over && !e.currentTarget.contains(e.relatedTarget as Node | null)) board.setOver(null)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        board.end()
        take(e.dataTransfer.files)
      }}
      className={`-m-3 flex flex-col gap-2.5 rounded-[14px] p-3 transition-[box-shadow,background-color] ${over ? `bg-(--cal-drop) ${OVER}` : board.files ? CAN_TAKE : ''}`}
    >
      <span className={EYEBROW}>Final cut</span>
      {card.cut ? (
        <span className="group/cut relative flex self-start">
          <span
            key={card.cut}
            className="bb-land relative block h-24 w-[54px] overflow-hidden rounded-[8px] bg-tile ring-1 ring-(--cal-line)"
          >
            <Media src={card.cut} sizes="54px" />
          </span>
          <button
            type="button"
            aria-label="Remove the final cut"
            onClick={() => edit({ cut: undefined })}
            className={`absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-page text-ink-3 shadow-soft group-hover/cut:opacity-100 hover:text-ink ${HOVER}`}
          >
            <CloseIcon />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`self-start ${QUIET} ${over ? 'text-ink' : ''}`}
        >
          {over
            ? 'Drop the final cut here'
            : board.files
              ? 'Drop the final cut'
              : 'Add the final cut'}
        </button>
      )}
      <span className="text-[12px] text-ink-4">
        One video, as the reel goes out. {card.cut ? '' : 'Until then the post keeps its media.'}
      </span>
      <input
        ref={input}
        type="file"
        accept="video/*"
        hidden
        aria-label="Add the final cut"
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />
    </section>
  )
}

/**
 * The four steps; the current one filled. Draft, Scheduled and Posted set the post's stage on the
 * calendar; Idea is only where a card starts, so it cannot be picked once the card is a post.
 */
function StatusPicker({ value, onChange }: { value: Step; onChange: (s: Step) => void }) {
  const brandColour = useBrand().brand.colour
  return (
    <span role="radiogroup" aria-label="Status" className="flex flex-wrap gap-1">
      {CHIPS.map((c) => {
        const on = c === value
        const locked = c === 'idea' && value !== 'idea'
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={locked}
            title={locked ? 'Already a post' : undefined}
            onClick={() => onChange(c)}
            className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors disabled:opacity-40 ${on ? 'bg-ink text-page' : 'bg-surface text-ink-3 enabled:hover:text-ink'}`}
          >
            {c === 'idea' ? (
              // A plan's mark, the calendar's dashed square, so Idea never reads as a shade of Draft.
              <span
                className="size-2 rounded-[2.5px] border border-dashed"
                style={{ borderColor: on ? 'var(--page)' : `var(${brandColour})` }}
              />
            ) : (
              <span
                className="size-1.5 rounded-full"
                style={{ background: on ? 'var(--page)' : statusColour(c) }}
              />
            )}
            {STATUS_LABEL[c]}
          </button>
        )
      })}
    </span>
  )
}

/** A suggestion: what it grew from, then keep it (it joins Idea, on the day it proposed) or skip. */
function Suggestion({ slot }: { slot: Slot }) {
  const { brand, weeks, addIdeaToCalendar } = useBrand()
  const router = useRouter()
  const { card } = slot
  const b = card.builtOn

  function keep() {
    keepSuggestion(brand.id, card.id)
    const dayN = landingDay(weeks, card.dayN)
    if (!dayN || card.format === 'story') return
    const where = addIdeaToCalendar(
      { format: card.format, hook: card.hook, why: b ? `Built on “${b.idea.hook}”` : 'Suggested' },
      dayN,
    )
    if (where) setDay(brand.id, card.id, dayN)
  }

  return (
    <section aria-label="Suggestion" className="flex max-w-[480px] flex-col gap-4">
      {b && (
        <div className="flex flex-col gap-2 rounded-[14px] bg-(--insight-wash) p-3.5">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-(--insight-6)">
            <SparkIcon size={9} />
            Built on your idea
          </span>
          <span className="font-display text-[16px] leading-[1.2]">“{b.idea.hook}”</span>
          {b.insight && (
            <span className="text-[12.5px] text-ink-2">
              {b.insight.line} ({b.insight.unit})
            </span>
          )}
        </div>
      )}
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={keep}
          className="bb-press flex h-10 items-center gap-2 rounded-full bg-ink pr-4 pl-3.5 text-[13.5px] font-medium text-page hover:opacity-85"
        >
          <CheckIcon size={10} strokeWidth={2.2} />
          Keep it
        </button>
        <button
          type="button"
          onClick={() => {
            // A skipped suggestion is gone, so its page goes back to the ideas it was among.
            router.push(IDEAS_HREF)
            skipSuggestion(brand.id, card.id)
          }}
          className="h-10 rounded-full px-3 text-[13.5px] text-ink-3 transition-colors hover:text-ink"
        >
          Skip
        </button>
      </span>
    </section>
  )
}
