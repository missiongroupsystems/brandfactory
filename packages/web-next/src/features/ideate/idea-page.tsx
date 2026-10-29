'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import {
  CheckIcon,
  CloseIcon,
  PhotosIcon,
  PlusIcon,
  SparkIcon,
  UploadIcon,
} from '@/components/icons'
import { fromFile, isVideo, Media, posterOf } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { startTouchDrag, touchDragPending } from '@/components/touch-drag'
import { usePhone } from '@/components/use-phone'
import type { BrandId } from '@/data/brands'
import type { Day, Format, Stage, Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import {
  isMediaRef,
  newShot,
  referenceById,
  referencesOf,
  type IdeaCard,
  type Reference,
  type Shot,
} from '@/data/ideas'
import { storyTaken } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'
import { Comments } from '@/features/share/comments'
import { ShareButton } from '@/features/share/share-button'
import { moveStart } from '@/features/shoot/model'
import {
  editShoot,
  leaveShoot,
  shootIdeaOn,
  useShootOf,
  useShoots,
} from '@/features/shoot/shoots-store'

import { dayLabel, landingDay } from './calendar-slot'
import { DayPicker, type DayInfo } from './day-picker'
import { accept, at, Handle, inside } from './drag-parts'
import { FormatIcon, STATUS_LABEL, useSlots, type Slot, useRename } from './idea-parts'
import { editIdea, keepSuggestion, setDay, skipSuggestion, type IdeaEdit } from './ideas-store'
import { useSortable, type Sortable } from './sortable'

const HAIR = 'border-(--cal-line)'
const TIMES = ['08:00', '09:00', '12:00', '15:00', '18:00', '19:30', '21:00']
const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const
/** A carousel takes ten slides at most, as the composer says. */
const SLIDES_MAX = 10
/** A section's name across the top of it. */
const H2 = 'text-[16px] font-medium tracking-[-0.01em]'
/** A label over a group of controls, in words, never a mono kicker. */
const LABEL = 'text-[13px] font-medium text-ink-3'
/** A quiet text action beside the main one. */
const QUIET = 'text-[13px] text-ink-3 transition-colors hover:text-ink'
/** What the final edit asks for, by format; the post goes out with it. */
const ADD_FINAL: Record<Format, string> = {
  reel: 'Add the final video',
  story: 'Add the final photo or video',
  carousel: 'Add the slides',
}
/** Where Back goes: the overview, not the moodboard the ideas page opens on. */
export const IDEAS_HREF = '/ideate?view=ideas'
/** The ring a tile or a card wears while something is held over it. */
const OVER = 'shadow-[inset_0_0_0_1.5px_var(--ink)]'
/** The faint ring every target wears while a file is somewhere over the page. */
const CAN_TAKE = 'shadow-[inset_0_0_0_1px_var(--cal-ghost)]'
/** Controls that show on hover or focus, and always under a finger. */
const HOVER =
  'opacity-0 transition-opacity focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
/**
 * Every place that takes media says so the same way: a small white pill with its icon (Upload,
 * Reference, From the moodboard), or a slot the size of a thumbnail with the upload mark.
 */
const CHIP =
  'bb-press flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-page px-3 text-[13px] text-ink-2 ring-1 ring-(--cal-ghost) select-none hover:text-ink hover:ring-(--line-strong) has-[:focus-visible]:ring-ink focus-visible:ring-ink focus-visible:outline-none'
const SIZES = '(max-width: 768px) 50vw, 240px'
/**
 * The lifted item: a touch lighter, a touch larger, with a shadow. It goes on a wrapper inside
 * the dragged node, never on the node itself: a transform on the drag's source ends the drag, and
 * so does an entrance animation that is still applied, which is why `bb-rise` sits there too.
 */
const LIFTED = 'scale-[1.03] opacity-60 shadow-pop'
const LIFTABLE = 'transition-[transform,opacity,box-shadow] duration-200'

/**
 * One idea's own page (`/ideate/<id>`): the production document for one reel, carousel or
 * story, from "we saw something we liked" to "it is live". The work runs in three sections, and
 * the page is built in that order: References (what it should look like), Storyboard (the shots
 * and the shoot day) and Post (the final edit, the day and the accounts, then one button that
 * puts it on the calendar). Every section is open at any time. Back returns to Current ideas.
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
        <div className="flex items-center justify-between gap-3 pb-5 max-md:pb-4">
          <Link href={IDEAS_HREF} className={`inline-flex items-center gap-1.5 ${QUIET}`}>
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
          {slot && <ShareButton kind="idea" id={id} />}
        </div>
        {slot ? (
          <Idea key={id} slot={slot} />
        ) : (
          <p className="text-[14px] text-ink-3">
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
    const taken = card.format === 'story' && storyTaken(weeks, d.date, card.postId)
    const note = taken
      ? 'story planned'
      : posts
        ? `${posts} post${posts > 1 ? 's' : ''}`
        : undefined
    ahead.set(d.date, { taken, disabled: taken, dot: posts > 0 || taken, note })
  }
  return ahead
}

interface Plan {
  time: string
  /** What the picker says of a day: ahead or not, taken, how many posts it holds. */
  infoOf: (day: Day) => DayInfo
  /** What the post carries, in order. */
  media: string[]
  /** The post's stage, or null while the idea has no post. */
  stage: Stage | null
  /** Why Schedule cannot go yet, in one line; null when it can. */
  blocker: string | null
  /**
   * Makes or moves the post as a draft on its day and opens it in the composer, the one place
   * that sends: the caption and the accounts are checked there. Refused while `blocker` says why.
   */
  schedule: () => void
  draft: () => void
  /** A scheduled or failed post back to a draft: the core drops its waiting jobs, the post stays. */
  unschedule: () => void
  /** Takes the post off the calendar, back to an idea on its day. Nothing that went out is taken back. */
  unplan: () => void
  setDate: (date: string) => void
  setTime: (time: string) => void
}

const sameMedia = (a: string[], b: string[]) =>
  a.length === b.length && a.every((m, i) => m === b[i])

/** What the final edit hands the post, or null while nothing has landed. */
const handedBy = (card: IdeaCard): string[] | null => (card.cut?.length ? card.cut : null)

/**
 * The card's plan. A date puts the idea's tile on that day; Schedule makes it a draft post there
 * once it has its final edit and a day, and hands it to the composer to send; a new date or time
 * moves the post.
 * The post carries the idea's own media only: a reference photo is somebody else's picture.
 * Once the final edit lands, the post carries that, and keeps up as it changes.
 */
function usePlan(slot: Slot): Plan {
  const {
    brand,
    weeks,
    byId,
    planPost,
    reschedule,
    setStage,
    setImages,
    placeIdea,
    unplanPost,
    settled,
  } = useBrand()
  const router = useRouter()
  // The time picked before the idea has a date; the post holds it from then on.
  const [picked, setPicked] = React.useState('18:00')
  const { card, date } = slot
  const post = card.postId ? byId(card.postId) : undefined
  const time = post?.slot.split(', ')[1] ?? picked
  const ahead = React.useMemo(() => daysAhead(weeks, card), [weeks, card])
  const infoOf = React.useCallback(
    (d: Day): DayInfo => ahead.get(d.date) ?? { disabled: true },
    [ahead],
  )
  const handed = React.useMemo(() => handedBy(card), [card])
  // What the post carried before the final edit took over, to give back if it is cleared again;
  // the idea's photo when that is not known.
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
      // A final edit handed earlier, on a page that has since been reopened.
      setImages(post.id, card.image ? [card.image] : [])
    }
  }, [post, handed, card.image, setImages])
  const media = handed ?? post?.images ?? (card.image ? [card.image] : [])
  const firstDay = () => {
    if (date && ahead.has(date) && !ahead.get(date)!.taken) return date
    if (card.format === 'story') return [...ahead].find(([, d]) => !d.taken)?.[0] ?? null
    return landingDay(weeks, card.date)
  }
  /** The post on its day at its time, at a stage; the id, or null when no day can take it. */
  const plan = (stage: Stage, day: string | null, t: string): string | null => {
    if (post?.stage === 'posted') return post.id
    if (post) {
      if (day && (day !== date || t !== time)) reschedule(post.id, day, t)
      if (stage !== post.stage) setStage(post.id, stage)
      return post.id
    }
    const d = day ?? firstDay()
    if (!d) return null
    const id = planPost(
      { ideaId: card.id, format: card.format, hook: card.hook, images: media },
      d,
      t,
      stage,
    )
    editIdea(brand.id, card.id, { postId: id })
    return id
  }
  // What the composer needs from here before it can send: the final edit, and a day the picker
  // would allow (ahead, and free for a story). Today is never offered, so a time that has gone
  // cannot be picked. The caption and the accounts are the composer's own checks. A draft needs
  // none of this: it is the plan, not the send.
  const dayInfo = date ? ahead.get(date) : undefined
  const blocker = !handed
    ? `${ADD_FINAL[card.format]} first.`
    : !date
      ? 'Pick a day.'
      : !dayInfo
        ? 'Pick a day ahead.'
        : dayInfo.taken
          ? 'That day has a story already.'
          : null
  return {
    time,
    infoOf,
    media,
    stage: post?.stage ?? null,
    blocker,
    schedule: () => {
      if (blocker || post?.stage === 'posted') return
      // A draft on its day, then the composer: the one place that sends, where the caption and
      // the accounts are checked. Two reviews found a second send path here wrong; there is none.
      const id = plan(post?.stage ?? 'draft', date, time)
      if (!id) return
      // On to the post only once the core has it: a refused plan reloads the brand without the
      // post, and its page would say it is not here. The app's message line says why it failed.
      void settled(id).then((refusal) => refusal === null && router.push(`/post/${id}`))
    },
    draft: () => {
      plan('draft', date, time)
    },
    unschedule: () => {
      if (post && post.stage !== 'posted') setStage(post.id, 'draft')
    },
    // The post leaves the calendar and the idea's tile returns. Posted is final: nothing changes it.
    unplan: () => {
      if (!post || post.stage === 'posted') return
      const why =
        card.source.kind === 'moment'
          ? card.source.title
          : card.source.kind === 'insight'
            ? card.source.line
            : 'Team idea'
      // What the old post carried before the final edit belongs to that post, not to the next one.
      before.current = null
      unplanPost(post.id, { format: card.format, hook: card.hook, why })
      editIdea(brand.id, card.id, { postId: undefined })
    },
    // A date moves a post; an idea without one stays an idea, its tile on the new day.
    setDate: (n) => {
      if (post || card.format === 'story') return plan(post?.stage ?? 'draft', n, time)
      const tile = weeks
        .flatMap((w) => w.days.flatMap(feedsOf))
        .find((m) => m.kind === 'idea' && m.hook === card.hook)
      placeIdea(
        {
          ideaId: card.id,
          format: card.format,
          hook: card.hook,
          why: tile?.kind === 'idea' ? tile.why : 'Team idea',
          ...(tile?.kind === 'idea' && tile.suggested ? { suggested: true } : {}),
        },
        n,
      )
    },
    setTime: (t) => (post && date ? reschedule(post.id, date, t) : setPicked(t)),
  }
}

// ── The sections ─────────────────────────────────────────────────────────────────────────────

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

/** The name of each file dropped or picked here, by its media URL, so the slot can say it. */
const fileNames = new Map<string, string>()

/**
 * What a slot calls its file: the name it was picked by, when this page load knows it. A core
 * URL or a reload has no name to give, and a storage key means nothing: a plain label then.
 */
function nameOf(src: string): string {
  return fileNames.get(src) ?? (isVideo(src) ? 'Final video' : 'Final photo')
}

/** The photos and videos among dropped or picked files, as media URLs. */
async function mediaFrom(files: FileList | null, kinds = 'image/*,video/*'): Promise<string[]> {
  // The kinds a slot takes, as its `accept` names them: a drop or "All files" gets past the picker.
  const fits = (f: File) => kinds.split(',').some((k) => f.type.startsWith(k.replace('*', '')))
  const media = [...(files ?? [])].filter(fits)
  return Promise.all(
    media.map(async (f) => {
      const { src } = await fromFile(f)
      fileNames.set(src, f.name)
      return src
    }),
  )
}

/**
 * Upload, as a pill: a label around a file input that is out of sight but not out of reach, so
 * a click or a tap opens the picker and the keyboard and a screen reader reach the input itself.
 */
function UploadChip({
  label,
  accept = 'image/*,video/*',
  multiple,
  onFiles,
}: {
  label: string
  accept?: string
  multiple?: boolean
  onFiles: (files: FileList | null) => void
}) {
  return (
    <label className={CHIP}>
      <UploadIcon size={12} />
      Upload
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        aria-label={label}
        className="sr-only"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────

/**
 * The idea: its words across the top, then the three sections down the page, each with its
 * name across the top and its work under it at the full width. One drag state serves the whole
 * page, since a reference can be dragged from its section onto a shot.
 */
function Idea({ slot }: { slot: Slot }) {
  const { brand } = useBrand()
  const phone = usePhone()
  const plan = usePlan(slot)
  const board = useBoard()
  const { status } = slot
  // The idea's shoot day is its shoot's day, which the call sheet can move.
  const shoot = useShootOf(brand.id, slot.card.id)
  const card = React.useMemo(
    () => (shoot ? { ...slot.card, shootDay: shoot.date } : slot.card),
    [slot.card, shoot],
  )
  const rename = useRename(card)
  const refs = refsOf(brand.id, card)
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
  const addRefs = (keys: string[]) =>
    edit((c) => ({
      inspiration: [...c.inspiration, ...keys.filter((k) => !c.inspiration.includes(k))],
    }))
  const patchShot = (id: string, fields: Partial<Shot>) =>
    edit((c) => ({ shots: c.shots.map((s) => (s.id === id ? { ...s, ...fields } : s)) }))
  const linkRef = (id: string, key: string | undefined) => patchShot(id, { ref: key })
  // The brand's other posts, for the moodboard pickers: what is not on the page yet.
  const more = referencesOf(brand.id).filter((r) => r.image && !card.inspiration.includes(r.id))
  // A moodboard post picked on a shot joins the references, and the shot is shot like it.
  const adoptRef = (id: string, key: string) =>
    edit((c) => ({
      inspiration: c.inspiration.includes(key) ? c.inspiration : [...c.inspiration, key],
      shots: c.shots.map((s) => (s.id === id ? { ...s, ref: key } : s)),
    }))

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
    <article className="flex flex-col gap-9 max-md:gap-7">
      <header className="flex max-w-[880px] flex-col gap-3">
        <span className="flex items-center gap-2 text-[13px] text-ink-3">
          <FormatIcon format={card.format} size={11} />
          {FORMAT_LABEL[card.format]} · {card.pillar}
        </span>
        <textarea
          value={card.hook}
          rows={1}
          onChange={(e) => rename(e.target.value)}
          aria-label="Hook"
          className="w-full resize-none bg-transparent font-display text-[34px] leading-[1.08] tracking-[-0.03em] [field-sizing:content] outline-none max-md:text-[28px]"
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

      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      <p id={hint} className="sr-only">
        Press Option with an arrow key to move it.
      </p>

      <div className="flex flex-col gap-9 max-md:gap-7">
        <Section id="references" label="References">
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
            more={more}
          />
          <Sharpen card={card} />
        </Section>

        <Section id="shots" label="Storyboard">
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
            more={more}
            adoptRef={adoptRef}
            onNudge={(id, by) => {
              const shot = card.shots.find((s) => s.id === id)
              moved(shot?.title || 'The shot', shotSort.order, id, by)
              shotSort.nudge(id, by)
            }}
          />
          <InFrame card={card} />
          {/* The shoot's day is its own chip, named; the card beside it says the rest. */}
          <div className="flex flex-wrap items-center gap-3">
            <ShootDay card={card} />
            <ShootLine card={card} />
          </div>
        </Section>

        <Section id="post" label="Post">
          {status === 'suggested' ? (
            <p className="text-[14px] text-ink-4">Keep the idea first.</p>
          ) : (
            <PlanSection slot={slot} plan={plan} board={board} edit={edit} />
          )}
        </Section>
      </div>
      <Comments
        kind="idea"
        id={card.id}
        replyAs={brand.name}
        change={{ href: '#shots', label: 'Storyboard' }}
      />
    </article>
  )
}

/** A section down the page: its name across the top, a control beside it, its work under it. */
function Section({
  id,
  label,
  aside,
  children,
}: {
  id: string
  label: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={`flex scroll-mt-6 flex-col gap-5 border-t ${HAIR} pt-7 first:border-t-0 first:pt-0 max-md:gap-4 max-md:pt-6`}
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className={H2}>{label}</h2>
        {aside}
      </div>
      <div className="flex min-w-0 flex-col gap-7 max-md:gap-6">{children}</div>
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
  more,
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
  /** The moodboard's posts that are not on the page yet. */
  more: Reference[]
}) {
  const [picking, setPicking] = React.useState(false)
  const over = board.over === 'files:refs'
  const add = async (files: FileList | null) => addRefs(await mediaFrom(files))

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
        className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-3 gap-y-4 max-md:grid-cols-2"
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
      <div className="flex flex-wrap items-center gap-2">
        <UploadChip label="Add reference files" multiple onFiles={(f) => void add(f)} />
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
          className={CHIP}
        >
          <PhotosIcon />
          {picking ? 'Done' : 'From the moodboard'}
        </button>
        {board.files && (
          <span className="pl-1.5 text-[13px] text-ink">
            {over ? 'Drop to add' : 'Drop here to add'}
          </span>
        )}
      </div>
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
            <span className="absolute top-2 left-2 rounded-full bg-page/90 px-2 py-0.5 text-[12px] font-medium text-ink">
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
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
              <PlatformLogo platform={r.post.platform} size={10} />
              <span className="truncate">{r.post.account}</span>
            </span>
          )}
        </span>
      </div>
    </li>
  )
}

/**
 * The hook in a field the team can edit, with three stronger hooks under it: picking one fills
 * the field (it is the title above, in the same words), typing changes it from there, and "Back
 * to mine" restores the team's words.
 */
function Sharpen({ card }: { card: IdeaCard }) {
  const use = useRename(card)
  // The hook as it was when the page opened, so "Back to mine" has somewhere to go.
  const [mine] = React.useState(card.hook)
  if (card.sharper.length === 0) return null
  const picked = card.sharper.findIndex((s) => s.text === card.hook)

  return (
    <section aria-label="Sharpen the hook" className="flex max-w-[560px] flex-col gap-2">
      <span className="flex items-center justify-between">
        <span className={LABEL}>Sharpen the hook</span>
        {card.hook !== mine && (
          <button type="button" onClick={() => use(mine)} className={QUIET}>
            Back to mine
          </button>
        )}
      </span>
      <textarea
        value={card.hook}
        rows={1}
        onChange={(e) => use(e.target.value)}
        aria-label="Edit the hook"
        className="w-full resize-none rounded-[12px] bg-surface px-3.5 py-2.5 font-display text-[17px] leading-[1.25] [field-sizing:content] outline-none focus-visible:shadow-[0_0_0_2px_var(--ink)]"
      />
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
              <span className="font-display text-[16px] leading-[1.2]">{s.text}</span>
              {on && <CheckIcon size={10} strokeWidth={2.2} />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── 02 Storyboard ────────────────────────────────────────────────────────────────────────────

/** What one shot is called: a carousel's shots are its slides. */
const unitOf = (card: IdeaCard) => (card.format === 'carousel' ? 'Slide' : 'Shot')

/**
 * The storyboard: the shots in order, each a card with the reference to shoot it like and its
 * line. Drag a card to reorder (the others make way), drag a reference onto a card to shoot it
 * like that (or pick one on the card). The last place in the row adds a shot.
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
  more,
  adoptRef,
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
  more: Reference[]
  adoptRef: (id: string, key: string) => void
  onNudge: (id: string, by: -1 | 1) => void
}) {
  const unit = unitOf(card)
  const [fresh, setFresh] = React.useState<string | null>(null)

  return (
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
      className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] items-start gap-3 max-md:grid-cols-1"
    >
      {shots.map((s) => (
        <ShotCard
          key={s.id}
          shot={s}
          index={sort.order.indexOf(s.id)}
          unit={unit}
          refs={refs}
          more={more}
          sort={sort}
          board={board}
          hint={hint}
          fresh={fresh === s.id}
          onTitle={(title) => patchShot(s.id, { title })}
          onLink={(key) => linkRef(s.id, key)}
          onAdopt={(key) => adoptRef(s.id, key)}
          onNudge={(by) => onNudge(s.id, by)}
          onRemove={() => setShots(card.shots.filter((o) => o.id !== s.id))}
        />
      ))}
      <li style={{ order: shots.length }}>
        <button
          type="button"
          onClick={() => {
            const shot = newShot('')
            setFresh(shot.id)
            setShots([...card.shots, shot])
          }}
          className="group/add flex size-full min-h-[64px] items-center gap-3 rounded-[14px] px-2.5 text-[14px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:outline-none max-md:min-h-0 max-md:py-2"
        >
          <span className="bb-press flex size-8 items-center justify-center rounded-full bg-page ring-1 ring-(--cal-ghost) group-hover/add:ring-(--line-strong)">
            <PlusIcon size={11} />
          </span>
          Add a {unit.toLowerCase()}
        </button>
      </li>
    </ol>
  )
}

function ShotCard({
  shot,
  index,
  unit,
  refs,
  more,
  sort,
  board,
  hint,
  fresh,
  onTitle,
  onLink,
  onAdopt,
  onNudge,
  onRemove,
}: {
  shot: Shot
  index: number
  unit: string
  refs: Ref[]
  /** The moodboard's posts not on the page yet: picking one adds it as a reference too. */
  more: Reference[]
  sort: Sortable
  board: Board
  hint: string
  /** Just added: the line takes the cursor. */
  fresh: boolean
  onTitle: (title: string) => void
  onLink: (key: string | undefined) => void
  onAdopt: (key: string) => void
  onNudge: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const key = `shot:${shot.id}`
  const [choosing, setChoosing] = React.useState(false)
  const held = sort.dragging === shot.id
  // A reference held over this card, and whether one is on its way anywhere.
  const over = board.over === key && !held
  const coming = board.drag?.kind === 'ref'
  const like = shot.ref ? refs.find((r) => r.key === shot.ref) : undefined
  const n = `${unit} ${index + 1}`
  const line = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    if (fresh) line.current?.focus()
  }, [fresh])
  // The picker takes the focus while open and hands it back to the control that opened it.
  const frame = React.useRef<HTMLButtonElement>(null)
  const first = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (choosing) first.current?.focus()
  }, [choosing])
  const close = () => {
    setChoosing(false)
    requestAnimationFrame(() => frame.current?.focus())
  }
  // A tap or click outside the open picker closes it without a change, as Escape does.
  const picker = React.useRef<HTMLSpanElement>(null)
  React.useEffect(() => {
    if (!choosing) return
    const away = (e: PointerEvent) => {
      if (!picker.current?.contains(e.target as Node)) setChoosing(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [choosing])
  const choose = (k: string | undefined) => {
    if (k !== shot.ref) onLink(k)
    close()
  }
  const adopt = (k: string) => {
    onAdopt(k)
    close()
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
  const picks =
    'grid shrink-0 grid-cols-3 auto-rows-[56px] gap-1 max-md:grid-cols-4 max-md:auto-rows-[64px]'
  const pick = 'relative overflow-hidden rounded-[6px] bg-tile'

  return (
    <li
      data-drop={key}
      data-flip={shot.id}
      draggable
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, textarea, label, input')) return
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
      onDragEnter={(e) => accept(e, !!board.drag)}
      onDragOver={(e) => {
        // Another shot slides past; a reference lands here; nothing else.
        const { drag } = board
        if (!accept(e, !!drag)) return
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
        if (drag?.kind === 'ref') onLink(drag.key)
        if (drag?.kind === 'shot') finish(true)
        else board.end()
      }}
      style={{ order: index }}
      // Open, the picker reaches past the card: the card rises over what follows it.
      className={`group/shot bb-touch-drag relative cursor-grab active:cursor-grabbing ${choosing ? 'z-20' : ''}`}
    >
      <Handle
        label={`Move ${n.toLowerCase()}: ${shot.title || 'untitled'}`}
        hint={hint}
        onNudge={onNudge}
      />
      {/* With a reference, the frame over the line (on a phone, at its left). Without one, the
          card is only its number and its line: an empty frame repeated down the row read as
          scaffolding. The small round mark picks a reference, and a reference dropped on the
          card lands as it did on the frame. */}
      <div
        className={`bb-rise relative h-full rounded-[14px] bg-surface p-2.5 ${like ? "grid grid-rows-[auto_1fr] gap-2.5 [grid-template-areas:'frame'_'text'] max-md:grid-cols-[88px_minmax(0,1fr)] max-md:gap-x-3 max-md:[grid-template-areas:'frame_text']" : 'flex flex-col'} ${LIFTABLE} ${held ? LIFTED : ''} ${over ? `bg-(--cal-drop) ${OVER}` : coming ? CAN_TAKE : ''}`}
      >
        {like && (
          <span className="relative block aspect-[4/3] overflow-hidden rounded-[10px] bg-surface-2 [grid-area:frame] max-md:aspect-[4/5]">
            <button
              ref={frame}
              type="button"
              aria-label={`Change the reference for ${n.toLowerCase()}`}
              onClick={() => setChoosing(true)}
              className="absolute inset-0 block bg-tile"
            >
              <span key={like.src} className="bb-land absolute inset-0">
                <Media src={like.src} sizes="(max-width: 768px) 88px, 220px" />
              </span>
            </button>
          </span>
        )}
        {choosing && (
          // The picker opens over the card from its top: the idea's references, None, then the
          // moodboard's other posts, which join the references when picked.
          <span
            ref={picker}
            role="group"
            aria-label={`A reference for ${n.toLowerCase()}`}
            className="bb-menu absolute inset-x-0 top-0 z-[5] flex max-h-[280px] min-h-full flex-col gap-1 overflow-y-auto rounded-[14px] bg-page p-1.5 shadow-pop [scrollbar-width:none]"
          >
            <span className="sticky top-0 z-[1] flex items-center justify-between bg-page px-1 pb-0.5">
              <span className="text-[13px] font-medium text-ink-3">Shoot it like</span>
              <button
                type="button"
                aria-label="Close the picker"
                onKeyDown={escape}
                onClick={() => choose(shot.ref)}
                className="flex size-6 items-center justify-center rounded-full bg-surface text-ink-3 hover:text-ink"
              >
                <CloseIcon />
              </button>
            </span>
            <span className={picks}>
              {refs.map((r, i) => (
                <button
                  key={r.key}
                  ref={i === 0 ? first : undefined}
                  type="button"
                  aria-label={`Like ${r.owner}`}
                  aria-pressed={r.key === shot.ref}
                  onKeyDown={escape}
                  onClick={() => choose(r.key)}
                  className={`${pick} ${r.key === shot.ref ? OVER : ''}`}
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
                className={`flex items-center justify-center rounded-[6px] text-[13px] text-ink-3 hover:text-ink ${shot.ref ? 'bg-surface' : OVER}`}
              >
                None
              </button>
            </span>
            {more.length > 0 && (
              <>
                <span className="px-1 pt-2 pb-0.5 text-[13px] font-medium text-ink-3">
                  From the moodboard
                </span>
                <span className={picks}>
                  {more.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-label={`From the moodboard: ${r.account}, ${r.borrow}`}
                      title={`${r.account} · ${r.borrow}`}
                      onKeyDown={escape}
                      onClick={() => adopt(r.id)}
                      className={pick}
                    >
                      <Media src={r.image} sizes="96px" />
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
        )}
        <span
          className={`flex min-w-0 flex-col gap-1 px-0.5 [grid-area:text] ${like ? 'max-md:pt-0.5 max-md:pr-9' : ''}`}
        >
          <span className="flex min-h-7 items-center justify-between gap-2 text-[13px] text-ink-4">
            <span className="shrink-0">{n}</span>
            {like ? (
              <span className="truncate">like {like.owner}</span>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                {(over || coming) && (
                  <span className="truncate text-ink">
                    {over ? 'Shoot it like this' : 'Drop it here'}
                  </span>
                )}
                <button
                  ref={frame}
                  type="button"
                  aria-label={`Pick a reference for ${n.toLowerCase()}`}
                  title="Pick a reference"
                  onClick={() => setChoosing(true)}
                  className="bb-press flex size-7 shrink-0 items-center justify-center rounded-full bg-page text-ink-3 ring-1 ring-(--cal-ghost) transition-colors hover:text-ink hover:ring-(--line-strong) focus-visible:ring-ink focus-visible:outline-none"
                >
                  <PhotosIcon />
                </button>
                {/* Beside the mark, in the card's own row: on a phone it shows at rest. */}
                <button
                  type="button"
                  aria-label={`Remove ${n.toLowerCase()}`}
                  onClick={onRemove}
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-ink-4 group-hover/shot:opacity-100 hover:text-ink ${HOVER}`}
                >
                  <CloseIcon />
                </button>
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
      {like && (
        <button
          type="button"
          aria-label={`Remove ${n.toLowerCase()}`}
          onClick={onRemove}
          className={`absolute top-4 right-4 flex size-6 items-center justify-center rounded-full bg-page/92 text-ink-3 shadow-soft group-hover/shot:opacity-100 hover:text-ink ${HOVER} ${choosing ? 'hidden' : ''}`}
        >
          <CloseIcon />
        </button>
      )}
    </li>
  )
}

/** The start times a shoot day offers on an idea's page; the call sheet has every half hour. */
const SHOOT_STARTS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']

/** Who or what is in frame: the dish, the chef, the room. */
function InFrame({ card }: { card: IdeaCard }) {
  const { brand } = useBrand()
  return (
    <label className="flex max-w-[560px] items-center gap-3 text-[13px]">
      <span className="w-[80px] shrink-0 text-ink-4">In frame</span>
      <input
        value={card.feature}
        onChange={(e) => editIdea(brand.id, card.id, { feature: e.target.value })}
        aria-label="Subject"
        placeholder="The dish, the chef, the room"
        className="w-full bg-transparent text-[14px] outline-none placeholder:text-ink-5"
      />
    </label>
  )
}

/**
 * The shoot day and time, beside the storyboard's name: one of the brand's shoots, or any day,
 * which starts a shoot there. The idea joins that shoot; its call sheet holds the rest.
 */
function ShootDay({ card }: { card: IdeaCard }) {
  const { brand, weeks } = useBrand()
  const all = useShoots(brand.id)
  const shoot = all.find((s) => s.ideaIds.includes(card.id))
  // The time picked before a day: the shoot it starts begins then.
  const [start, setStart] = React.useState('12:00')
  // The shoots ahead, as shortcuts; two can share a day.
  const shoots = React.useMemo(() => {
    const ahead = new Set(weeks.flatMap((w) => w.days.filter((d) => !d.past).map((d) => d.date)))
    return all
      .filter((s) => ahead.has(s.date))
      .map((s) => ({
        key: s.id,
        date: s.date,
        label: `${s.title} · ${dayLabel(s.date)}, ${s.start}`,
      }))
  }, [all, weeks])
  const infoOf = React.useCallback(
    (d: Day): DayInfo => {
      const here = shoots.filter((s) => s.date === d.date)
      return { disabled: !!d.past, dot: here.length > 0, note: here.map((s) => s.label).join(', ') }
    },
    [shoots],
  )
  return (
    <DayPicker
      label="Shoot day"
      prefix="Shoot"
      down
      value={shoot?.date ?? null}
      placeholder="Pick a day"
      onChange={(date) => shootIdeaOn(brand.id, weeks, card.id, date, shoot?.start ?? start)}
      onClear={() => leaveShoot(brand.id, card.id)}
      infoOf={infoOf}
      shortcuts={shoots}
      time={shoot?.start ?? start}
      times={SHOOT_STARTS}
      onTime={(t) => (shoot ? editShoot(brand.id, shoot.id, moveStart(shoot, t)) : setStart(t))}
    />
  )
}

/**
 * The shoot this idea is in, beside its day: where, who and what else is shot that day, with its
 * call sheet a click away. The day itself is the chip's, said once.
 */
function ShootLine({ card }: { card: IdeaCard }) {
  const { brand } = useBrand()
  const shoot = useShootOf(brand.id, card.id)
  if (!shoot) return null
  const others = shoot.ideaIds.length - 1
  const meta = [
    `${shoot.crew.length} ${shoot.crew.length === 1 ? 'person' : 'people'}`,
    others > 0 ? `${others} more ${others === 1 ? 'idea' : 'ideas'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Link
      href={`/shoot/${shoot.id}`}
      className="group/shoot flex h-8 max-w-full min-w-0 items-center gap-3 rounded-full bg-(--layer-shoot) pr-3 pl-3.5 text-[13px] text-(--layer-shoot-ink) transition-[filter] hover:brightness-[0.97]"
    >
      <span className="min-w-0 truncate">
        <span className="font-medium">{shoot.title}</span>
        <span className="opacity-80"> · {meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 font-medium">
        Call sheet
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className="transition-transform group-hover/shoot:translate-x-0.5"
        >
          <path
            d="M2.5 6h7M6.5 3l3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  )
}

/**
 * A slot that takes a photo or a clip: the upload mark while empty, the thumbnail once it is
 * here, and a tap on either picks a file. Like the Upload pill, it is a label around the input,
 * and the words beside an empty slot are part of that label: a tap on them picks a file too.
 */
function MediaSlot({
  media,
  label,
  removeLabel,
  accept = 'image/*,video/*',
  multiple,
  tall = false,
  words = false,
  named = false,
  over,
  files,
  onMedia,
  onClear,
}: {
  media: string | undefined
  /** The input's name, and the words beside an empty slot: "Add the final video". */
  label: string
  removeLabel: string
  accept?: string
  /** Several files at once: a carousel's slides. */
  multiple?: boolean
  /** A reel's final edit stands as the reel does. */
  tall?: boolean
  /** Says what it takes, beside the slot, while empty. */
  words?: boolean
  /** Says the file's name beside the slot once it holds one, so the upload shows it landed. */
  named?: boolean
  over: boolean
  files: boolean
  onMedia: (media: string[]) => void
  onClear: () => void
}) {
  const size = tall ? 'h-24 w-[54px]' : 'size-12'
  return (
    <span className="group/media relative flex shrink-0">
      <label
        className={`group/slot flex cursor-pointer items-center gap-3.5 ${words || named ? 'pr-2' : ''}`}
      >
        <span
          className={`bb-press relative flex ${size} items-center justify-center overflow-hidden rounded-[10px] group-has-[:focus-visible]/slot:ring-[1.5px] group-has-[:focus-visible]/slot:ring-ink ${media ? 'bg-tile' : `ring-1 ${over ? 'bg-(--cal-drop) text-ink ring-ink' : files ? 'bg-page text-ink-2 ring-ink-4' : 'bg-page text-ink-3 ring-(--cal-ghost) group-hover/slot:text-ink group-hover/slot:ring-(--line-strong)'}`}`}
        >
          {media ? (
            <span key={media} className="bb-land absolute inset-0">
              {isVideo(media) && !posterOf(media) ? (
                // A dropped video has no poster: a moment in, the browser paints its first frame.
                <video
                  src={media.replace(/#video$/, '#t=0.1')}
                  muted
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <Media src={media} sizes={tall ? '54px' : '48px'} />
              )}
            </span>
          ) : (
            <UploadIcon size={15} />
          )}
        </span>
        {named && media && (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="max-w-[260px] truncate text-[14px] font-medium text-ink">
              {nameOf(media)}
            </span>
            <span className="text-[13px] text-ink-3">Tap to replace</span>
          </span>
        )}
        {words && !media && (
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px] font-medium text-ink">{label}</span>
            <span className="text-[13px] text-ink-3">
              {over ? 'Drop it' : files ? 'Drop it here' : 'Drop a file, or tap to pick one.'}
            </span>
          </span>
        )}
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          aria-label={label}
          className="sr-only"
          onChange={(e) => {
            void mediaFrom(e.target.files, accept).then((m) => m.length && onMedia(m))
            e.target.value = ''
          }}
        />
      </label>
      {media && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onClear}
          className={`absolute -top-1.5 ${named ? 'left-[42px]' : '-right-1.5'} flex size-5 items-center justify-center rounded-full bg-page text-ink-3 shadow-soft group-hover/media:opacity-100 hover:text-ink ${HOVER}`}
        >
          <CloseIcon />
        </button>
      )}
    </span>
  )
}

// ── 03 Post ──────────────────────────────────────────────────────────────────────────────────

/**
 * The final edit, then the day and one button that puts the post on the calendar as a draft and
 * opens it in the composer, where it is scheduled: what the videographer sends back lands first,
 * and the button waits for it. Once the post is scheduled, its state stands where the button
 * was, with the quiet way back to a draft.
 */
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
  const { times } = useBrand()
  const { card, date } = slot
  const { stage } = plan
  const final = stage === 'posted'
  const when = date ? `${dayLabel(date)}, ${plan.time}` : null

  return (
    <div className="flex flex-col gap-7 max-md:gap-6">
      <FinalEdit card={card} board={board} edit={edit} />
      <section aria-label="Plan" className="flex flex-col gap-2.5">
        {/* The day, then the way on: the button opens the post, where Schedule is pressed. It
            never sends from here, so it does not say Schedule. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <DayPicker
            label="Post date"
            prefix="Post"
            down
            value={date}
            placeholder="Pick a day and a time"
            disabled={final}
            onChange={plan.setDate}
            infoOf={plan.infoOf}
            time={plan.time}
            times={TIMES}
            best={times?.best}
            onTime={plan.setTime}
          />
          {(stage === null || stage === 'draft') && (
            <>
              <button
                type="button"
                disabled={plan.blocker !== null}
                onClick={plan.schedule}
                className="bb-press flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-30"
              >
                Continue to post
                <span aria-hidden="true">→</span>
              </button>
              {stage === null ? (
                <button type="button" onClick={plan.draft} className={QUIET}>
                  Save as draft
                </button>
              ) : (
                <button
                  type="button"
                  onClick={plan.unplan}
                  title="Removes the draft from the calendar; the idea keeps its day."
                  className={QUIET}
                >
                  Remove the draft
                </button>
              )}
            </>
          )}
        </div>
        {(stage === null || stage === 'draft') && plan.blocker && (
          <p className="text-[13px] text-ink-3">{plan.blocker}</p>
        )}
        {stage === 'draft' && when && (
          <PostLinks card={card} text={`Draft · ${when}`} open={false} />
        )}
        {stage !== null && stage !== 'draft' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <PostLinks card={card} text={`${STATUS_LABEL[stage]} · ${when ?? ''}`} />
            {(stage === 'scheduled' || stage === 'failed') && (
              <button
                type="button"
                onClick={plan.unschedule}
                title="Back to a draft: nothing goes out; the post and its caption stay."
                className={QUIET}
              >
                Unschedule
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/** Where the post stands, as a link to the calendar, and its page in the scheduler. */
function PostLinks({
  card,
  text,
  open = true,
}: {
  card: IdeaCard
  text: string
  /** The link to the post; off where the button beside it opens the post already. */
  open?: boolean
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      <Link href="/" className="font-medium text-ink hover:underline">
        {text}
        {card.format === 'story' ? ' · story row' : ''}
      </Link>
      {open && card.postId && (
        <Link href={`/post/${card.postId}`} className={QUIET}>
          Open in scheduler →
        </Link>
      )}
    </span>
  )
}

/**
 * The final edit: what goes out, as the videographer sent it back. A reel is one video, a story
 * one photo or video; a carousel is its slides in order, several files at once. Drop files here or tap a
 * slot; the post carries the final edit from then on.
 */
function FinalEdit({
  card,
  board,
  edit,
}: {
  card: IdeaCard
  board: Board
  edit: (fields: IdeaEdit | ((c: IdeaCard) => IdeaEdit)) => void
}) {
  const key = 'files:cut'
  const over = board.over === key
  const slides = card.format === 'carousel'
  // A reel is a video; a story or a carousel slide may be a photo or a video.
  const kinds = card.format === 'reel' ? 'video/*' : 'image/*,video/*'
  const cut = card.cut ?? []
  // A video replaces the one before it; slides join the ones there, up to the carousel's ten.
  const add = (media: string[]) =>
    slides
      ? edit((c) => ({ cut: [...(c.cut ?? []), ...media].slice(0, SLIDES_MAX) }))
      : edit({ cut: media.slice(0, 1) })
  const set = (i: number, media: string) =>
    edit((c) => ({ cut: (c.cut ?? []).map((m, j) => (j === i ? media : m)) }))
  const drop = (i: number) => edit((c) => ({ cut: (c.cut ?? []).filter((_, j) => j !== i) }))

  return (
    <section
      aria-label="Final edit"
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
        void mediaFrom(e.dataTransfer.files, kinds).then((m) => m.length && add(m))
      }}
      className={`-m-3 flex flex-col gap-2.5 rounded-[14px] p-3 transition-[box-shadow,background-color] ${over ? `bg-(--cal-drop) ${OVER}` : board.files ? CAN_TAKE : ''}`}
    >
      {cut.length > 0 && (
        <span className={`${LABEL} flex items-center gap-2`}>
          Final edit
          {slides && <span className="font-normal text-ink-4 tabular-nums">{cut.length}</span>}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2.5">
        {slides &&
          cut.map((m, i) => (
            <MediaSlot
              key={`${i}:${m}`}
              media={m}
              label={`Replace slide ${i + 1} of the final edit`}
              removeLabel={`Remove slide ${i + 1} of the final edit`}
              accept={kinds}
              over={false}
              files={board.files}
              onMedia={([first]) => first && set(i, first)}
              onClear={() => drop(i)}
            />
          ))}
        {(slides ? cut.length < SLIDES_MAX : true) && (
          <MediaSlot
            media={slides ? undefined : cut[0]}
            label={ADD_FINAL[card.format]}
            removeLabel="Remove the final edit"
            accept={kinds}
            multiple={slides}
            tall={!slides}
            words={cut.length === 0}
            named={!slides}
            over={over}
            files={board.files}
            onMedia={add}
            onClear={() => edit({ cut: undefined })}
          />
        )}
      </span>
    </section>
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
    const date = landingDay(weeks, card.date)
    if (!date || card.format === 'story') return
    const where = addIdeaToCalendar(
      {
        ideaId: card.id,
        format: card.format,
        hook: card.hook,
        why: b ? `Built on “${b.idea.hook}”` : 'Suggested',
      },
      date,
    )
    if (where) setDay(brand.id, card.id, date)
  }

  return (
    <section aria-label="Suggestion" className="flex max-w-[480px] flex-col gap-4">
      {b && (
        <div className="flex flex-col gap-2 rounded-[14px] bg-(--insight-wash) p-3.5">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-(--insight-6)">
            <SparkIcon size={9} />
            Built on your idea
          </span>
          <span className="font-display text-[16px] leading-[1.2]">“{b.idea.hook}”</span>
          {b.insight && (
            <span className="text-[13px] text-ink-2">
              {b.insight.line} ({b.insight.unit})
            </span>
          )}
        </div>
      )}
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={keep}
          className="bb-press flex h-10 items-center gap-2 rounded-full bg-ink pr-4 pl-3.5 text-[14px] font-medium text-page hover:opacity-85"
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
          className="h-10 rounded-full px-3 text-[14px] text-ink-3 transition-colors hover:text-ink"
        >
          Skip
        </button>
      </span>
    </section>
  )
}
