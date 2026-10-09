'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { CheckIcon, CloseIcon, PlusIcon, SparkIcon } from '@/components/icons'
import { fromFile, Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { startTouchDrag, touchDragPending } from '@/components/touch-drag'
import type { BrandId } from '@/data/brands'
import type { Stage, Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import {
  isMediaRef,
  referenceById,
  referencesOf,
  type IdeaCard,
  type IdeaStatus,
  type Reference,
  type Shot,
} from '@/data/ideas'
import { storyTaken } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'

import { dayIndex, dayLabel, landingDay } from './calendar-slot'
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

const HAIR = 'border-(--cal-line)'
const TIMES = ['08:00', '12:00', '15:00', '18:00', '19:30', '21:00']
const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const
/** Where Back goes: the overview, not the moodboard the ideas page opens on. */
export const IDEAS_HREF = '/ideate?view=ideas'
/** The ring a tile or a card wears while something is held over it. */
const OVER = 'shadow-[inset_0_0_0_1.5px_var(--ink)]'
/** Controls that show on hover, and always under a finger. */
const HOVER =
  'opacity-0 transition-opacity focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
const SIZES = '(max-width: 768px) 50vw, 240px'

type Step = (typeof CHIPS)[number]

/** The step a card is at: "draft" is the calendar's word for an idea, and a failed post was scheduled. */
function stepOf(status: IdeaStatus): Step {
  if (status === 'failed') return 'scheduled'
  return status === 'draft' || status === 'suggested' ? 'idea' : status
}

/** The calendar's stage for a step: "Idea" is a draft post. */
function stageOf(step: Step): Stage {
  return step === 'idea' ? 'draft' : step
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
  const slot = useSlots().find((s) => s.card.id === id)
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

/** The days ahead a post can take, in words; a story cannot share its row with another story. */
function daysAhead(weeks: Week[], card: IdeaCard) {
  return weeks
    .flatMap((w) => w.days)
    .filter((d) => !d.past && !d.today)
    .map((d) => {
      // Other posts on the day; this idea's own post does not count.
      const posts = feedsOf(d).filter((m) => m.kind === 'post' && m.postId !== card.postId).length
      const taken = card.format === 'story' && storyTaken(weeks, d.n, card.postId)
      const note = taken
        ? ' · story planned'
        : card.format !== 'story' && posts
          ? ` · ${posts} post${posts > 1 ? 's' : ''}`
          : ''
      return { n: d.n, label: `${dayLabel(weeks, d.n)}${note}`, taken }
    })
}

interface Plan {
  time: string
  days: ReturnType<typeof daysAhead>
  /** What the post carries: the shoot's media in shot order, else the post's, else the idea's photo. */
  media: string[]
  /** How many of those the shoot captured. */
  fromShoot: number
  setStatus: (step: Step) => void
  setDate: (dayN: string) => void
  setTime: (time: string) => void
}

/** What the shoot captured, in shot order. */
const capturedOf = (shots: Shot[]) => shots.flatMap((s) => (s.media ? [s.media] : []))

/**
 * The card's plan. A date makes the idea a post on the calendar, a status sets that post's
 * stage, and a new date or time moves it. A status set before a date takes the first free day.
 * The post carries the idea's own media only: a reference photo is somebody else's picture.
 * Once the shoot has captured something, the post carries that, and keeps up as more lands.
 */
function usePlan(slot: Slot): Plan {
  const { brand, weeks, byId, planPost, reschedule, setStage, setImages } = useBrand()
  // The time picked before the idea has a date; the post holds it from then on.
  const [picked, setPicked] = React.useState('18:00')
  const { card, dayN } = slot
  const post = card.postId ? byId(card.postId) : undefined
  const time = post?.slot.split(', ')[1] ?? picked
  const days = daysAhead(weeks, card)
  const captured = React.useMemo(() => capturedOf(card.shots), [card.shots])
  React.useEffect(() => {
    if (post && captured.length > 0) setImages(post.id, captured)
  }, [post, captured, setImages])
  const media = captured.length > 0 ? captured : (post?.images ?? (card.image ? [card.image] : []))
  const firstDay = () => {
    if (dayN && days.some((d) => d.n === dayN && !d.taken)) return dayN
    if (card.format === 'story') return days.find((d) => !d.taken)?.n ?? null
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
    days,
    media,
    fromShoot: captured.length,
    setStatus: (step) => plan(stageOf(step), dayN, time),
    setDate: (n) => plan(post?.stage ?? 'draft', n, time),
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

/** What is being dragged: a reference by its key, or a shot by its place. */
type Drag = { kind: 'ref'; key: string } | { kind: 'shot'; index: number }

/** The drag in flight and what it is over (`ref:<key>`, `shot:<i>`, `files:<where>`). */
interface Board {
  drag: Drag | null
  /** The same drag, readable from a touch drop, whose callbacks were made before it began. */
  held: React.RefObject<Drag | null>
  over: string | null
  start: (d: Drag) => void
  setOver: (key: string | null) => void
  end: () => void
}

function useBoard(): Board {
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const [over, setOver] = React.useState<string | null>(null)
  const held = React.useRef<Drag | null>(null)
  return {
    drag,
    held,
    over,
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

/** The list with one item moved. */
function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

/** True when a drag carries files from outside the page. */
function hasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/** The photos and videos among dropped or picked files, as media URLs. */
async function mediaFrom(files: FileList | null): Promise<string[]> {
  const media = [...(files ?? [])].filter((f) => /^(image|video)\//.test(f.type))
  return (await Promise.all(media.map(fromFile))).map((d) => d.src)
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────

/**
 * The idea: its words across the top, then the rail, then the four stages down the page, each
 * with its name and question in a column on the left and its work on the right. One drag state
 * serves the whole page, since a reference can be dragged from its stage onto a shot.
 */
function Idea({ slot }: { slot: Slot }) {
  const { brand, weeks } = useBrand()
  const plan = usePlan(slot)
  const board = useBoard()
  const { card, status } = slot
  const rename = useRename(card)
  const refs = refsOf(brand.id, card)
  const stages = stagesOf(refs, card, slot, weeks, plan.time)
  const stage = (key: StageKey) => stages.find((s) => s.key === key)!

  const edit = (fields: IdeaEdit | ((c: IdeaCard) => IdeaEdit)) =>
    editIdea(brand.id, card.id, fields)
  const setShots = (shots: Shot[]) => edit({ shots })
  // Writes that follow an await read the card as it is then, not as it was before the wait.
  const addRefs = (keys: string[]) => edit((c) => ({ inspiration: [...c.inspiration, ...keys] }))
  const patchShot = (index: number, fields: Partial<Shot>) =>
    edit((c) => ({ shots: c.shots.map((s, i) => (i === index ? { ...s, ...fields } : s)) }))

  // A file dropped between the drop zones would open in the tab, and the demo's memory with it.
  React.useEffect(() => {
    const guard = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    window.addEventListener('dragover', guard)
    window.addEventListener('drop', guard)
    return () => {
      window.removeEventListener('dragover', guard)
      window.removeEventListener('drop', guard)
    }
  }, [])
  const setRefs = (inspiration: string[]) =>
    edit({
      inspiration,
      // A shot shot like a reference that left the page is shot like nothing.
      shots: card.shots.map((s) =>
        s.ref && !inspiration.includes(s.ref) ? { ...s, ref: undefined } : s,
      ),
    })

  const actions = {
    moveRef: (from: number, to: number) => setRefs(move(card.inspiration, from, to)),
    linkRef: (index: number, key: string | undefined) =>
      setShots(card.shots.map((s, i) => (i === index ? { ...s, ref: key } : s))),
    moveShot: (from: number, to: number) => setShots(move(card.shots, from, to)),
  }

  /** Where a drag lands, by touch or by mouse: `ref:<key>` or `shot:<i>`. */
  function land(target: string | null) {
    const drag = board.held.current
    if (!drag || !target) return
    const at = target.indexOf(':')
    const kind = target.slice(0, at)
    const id = target.slice(at + 1)
    if (drag.kind === 'ref' && kind === 'ref') {
      actions.moveRef(card.inspiration.indexOf(drag.key), card.inspiration.indexOf(id))
    } else if (drag.kind === 'ref' && kind === 'shot') actions.linkRef(Number(id), drag.key)
    else if (drag.kind === 'shot' && kind === 'shot') actions.moveShot(drag.index, Number(id))
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

      <div className="flex flex-col gap-16 max-md:gap-12">
        <StageSection stage={stage('references')}>
          <References
            card={card}
            refs={refs}
            board={board}
            land={land}
            setRefs={setRefs}
            addRefs={addRefs}
            moveRef={actions.moveRef}
          />
          <Sharpen card={card} />
        </StageSection>

        <StageSection stage={stage('shots')}>
          <Storyboard
            card={card}
            refs={refs}
            board={board}
            land={land}
            setShots={setShots}
            patchShot={patchShot}
            linkRef={actions.linkRef}
            moveShot={actions.moveShot}
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
            <PlanSection slot={slot} plan={plan} />
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

/** A stage's mark: filled once done, ringed with a dot while current, a faint ring ahead. */
function StageMark({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-ink text-page">
        <CheckIcon size={8} strokeWidth={2.4} />
      </span>
    )
  }
  return (
    <span
      className={`flex size-4 items-center justify-center rounded-full border ${current ? 'border-[1.5px] border-ink' : 'border-(--line-strong)'}`}
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
 * order, the first as the main look. Drag a tile onto another to reorder (or use its arrows),
 * drag it onto a shot to shoot that shot like it, drop files anywhere here to add them, or add a
 * post from the moodboard.
 */
function References({
  card,
  refs,
  board,
  land,
  setRefs,
  addRefs,
  moveRef,
}: {
  card: IdeaCard
  refs: Ref[]
  board: Board
  land: (target: string | null) => void
  setRefs: (inspiration: string[]) => void
  addRefs: (keys: string[]) => void
  moveRef: (from: number, to: number) => void
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
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        board.setOver('files:refs')
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
      className={`-m-3 flex flex-col gap-5 rounded-[18px] p-3 transition-colors ${over ? 'bg-(--cal-drop)' : ''}`}
    >
      <ol className="grid grid-cols-4 gap-x-3 gap-y-5 max-xl:grid-cols-3 max-md:grid-cols-2">
        {refs.map((r, i) => (
          <RefTile
            key={r.key}
            r={r}
            index={i}
            count={refs.length}
            board={board}
            land={land}
            onMove={(to) => moveRef(i, to)}
            onRemove={() => setRefs(card.inspiration.filter((k) => k !== r.key))}
          />
        ))}
        <li>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={`flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed text-center transition-colors ${over ? 'border-ink-3 text-ink' : 'border-(--cal-ghost) text-ink-4 hover:border-(--line-strong) hover:text-ink'}`}
          >
            <PlusIcon size={14} />
            <span className="px-3 text-[13px] leading-tight font-medium">
              {over ? 'Drop to add' : 'Add or drop a file'}
            </span>
          </button>
        </li>
      </ol>
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
      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
          className="self-start text-[13px] text-ink-3 transition-colors hover:text-ink"
        >
          {picking ? 'Done' : 'Add from the moodboard'}
        </button>
        {picking && (
          <ol
            aria-label="From the moodboard"
            className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]"
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
    </div>
  )
}

/** One reference: its photo, what to borrow and whose it is; the first is the main look. */
function RefTile({
  r,
  index,
  count,
  board,
  land,
  onMove,
  onRemove,
}: {
  r: Ref
  index: number
  count: number
  board: Board
  land: (target: string | null) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const key = `ref:${r.key}`
  const held = board.drag?.kind === 'ref' && board.drag.key === r.key
  const over = board.over === key && !held
  return (
    <li
      data-drop={key}
      draggable
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        startTouchDrag(e, {
          start: () => board.start({ kind: 'ref', key: r.key }),
          over: board.setOver,
          drop: land,
          end: board.end,
          lift: { selector: '[data-photo]', size: 96 },
        })
      }}
      onDragStart={(e) => {
        if (touchDragPending()) return e.preventDefault()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
        board.start({ kind: 'ref', key: r.key })
      }}
      onDragEnd={board.end}
      onDragOver={(e) => {
        if (board.drag?.kind !== 'ref' || held) return
        e.preventDefault()
        e.stopPropagation()
        if (board.over !== key) board.setOver(key)
      }}
      onDrop={(e) => {
        if (board.drag?.kind !== 'ref') return
        e.preventDefault()
        e.stopPropagation()
        land(key)
        board.end()
      }}
      className="group/ref bb-touch-drag flex cursor-grab flex-col gap-2 active:cursor-grabbing"
      style={{ opacity: held ? 0.35 : 1 }}
    >
      <span
        data-photo
        className={`relative block aspect-[4/5] overflow-hidden rounded-[14px] bg-tile transition-shadow ${over ? OVER : ''}`}
      >
        <Media src={r.src} sizes={SIZES} />
        {index === 0 && (
          <span className="absolute top-2 left-2 rounded-full bg-page/90 px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-ink uppercase">
            Main look
          </span>
        )}
        <span
          className={`absolute right-2 bottom-2 flex items-center gap-0.5 rounded-full bg-page/92 p-0.5 text-ink-3 shadow-soft group-hover/ref:opacity-100 ${HOVER}`}
        >
          <Nudge
            label={`Move reference ${index + 1} earlier`}
            dir="back"
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          />
          <Nudge
            label={`Move reference ${index + 1} later`}
            dir="on"
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          />
          <button
            type="button"
            aria-label={`Remove reference ${index + 1}`}
            onClick={onRemove}
            className="flex size-6 items-center justify-center rounded-full hover:text-ink"
          >
            <CloseIcon />
          </button>
        </span>
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
    </li>
  )
}

/** A small arrow that moves an item one place; the click path beside the drag. */
function Nudge({
  label,
  dir,
  disabled,
  onClick,
}: {
  label: string
  dir: 'back' | 'on'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-full hover:text-ink disabled:opacity-30 disabled:hover:text-ink-3"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d={dir === 'back' ? 'M7.5 2.5L4 6l3.5 3.5' : 'M4.5 2.5L8 6l-3.5 3.5'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
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
 * line. Drag a card onto another to reorder, drag a reference onto a card to shoot it like that
 * (or pick one on the card), drop a file on a card to hand the shot what was captured.
 */
function Storyboard({
  card,
  refs,
  board,
  land,
  setShots,
  patchShot,
  linkRef,
  moveShot,
}: {
  card: IdeaCard
  refs: Ref[]
  board: Board
  land: (target: string | null) => void
  setShots: (shots: Shot[]) => void
  patchShot: (index: number, fields: Partial<Shot>) => void
  linkRef: (index: number, key: string | undefined) => void
  moveShot: (from: number, to: number) => void
}) {
  const unit = unitOf(card)
  const [fresh, setFresh] = React.useState<number | null>(null)

  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3 max-md:grid-cols-1">
      {card.shots.map((s, i) => (
        <ShotCard
          key={i}
          shot={s}
          index={i}
          count={card.shots.length}
          unit={unit}
          refs={refs}
          board={board}
          land={land}
          fresh={fresh === i}
          onTitle={(title) => patchShot(i, { title })}
          onLink={(key) => linkRef(i, key)}
          onMedia={(media) => patchShot(i, { media, captured: true })}
          onMove={(to) => moveShot(i, to)}
          onRemove={() => setShots(card.shots.filter((_, j) => j !== i))}
        />
      ))}
      <li>
        <button
          type="button"
          onClick={() => {
            setFresh(card.shots.length)
            setShots([...card.shots, { title: '' }])
          }}
          className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-(--cal-ghost) text-ink-4 transition-colors hover:border-(--line-strong) hover:text-ink max-md:min-h-[56px] max-md:flex-row"
        >
          <PlusIcon size={13} />
          <span className="text-[13px] font-medium">Add a {unit.toLowerCase()}</span>
        </button>
      </li>
    </ol>
  )
}

function ShotCard({
  shot,
  index,
  count,
  unit,
  refs,
  board,
  land,
  fresh,
  onTitle,
  onLink,
  onMedia,
  onMove,
  onRemove,
}: {
  shot: Shot
  index: number
  count: number
  unit: string
  refs: Ref[]
  board: Board
  land: (target: string | null) => void
  /** Just added: the line takes the cursor. */
  fresh: boolean
  onTitle: (title: string) => void
  onLink: (key: string | undefined) => void
  onMedia: (media: string) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const key = `shot:${index}`
  const [choosing, setChoosing] = React.useState(false)
  const held = board.drag?.kind === 'shot' && board.drag.index === index
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
  const choose = (key: string | undefined) => {
    if (key !== shot.ref) onLink(key)
    setChoosing(false)
    requestAnimationFrame(() => frame.current?.focus())
  }
  const escape = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    choose(shot.ref)
  }

  return (
    <li
      data-drop={key}
      draggable
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, textarea')) return
        startTouchDrag(e, {
          start: () => board.start({ kind: 'shot', index }),
          over: board.setOver,
          drop: land,
          end: board.end,
        })
      }}
      onDragStart={(e) => {
        if (touchDragPending()) return e.preventDefault()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
        board.start({ kind: 'shot', index })
      }}
      onDragEnd={board.end}
      onDragOver={(e) => {
        // A shot takes another shot's place, a reference, or a file; nothing else.
        if (!(board.drag && !held) && !hasFiles(e)) return
        e.preventDefault()
        if (board.over !== key) board.setOver(key)
      }}
      onDragLeave={(e) => {
        if (over && !e.currentTarget.contains(e.relatedTarget as Node | null)) board.setOver(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (hasFiles(e)) void mediaFrom(e.dataTransfer.files).then(([m]) => m && onMedia(m))
        else land(key)
        board.end()
      }}
      className={`group/shot bb-touch-drag relative flex cursor-grab flex-col gap-2.5 rounded-[14px] bg-surface p-2.5 transition-shadow active:cursor-grabbing max-md:grid max-md:grid-cols-[96px_minmax(0,1fr)] max-md:items-start ${over ? OVER : ''}`}
      style={{ opacity: held ? 0.35 : 1 }}
    >
      <span className="relative block aspect-[4/3] overflow-hidden rounded-[10px] bg-tile max-md:aspect-[4/5]">
        {choosing ? (
          <span
            role="group"
            aria-label={`A reference for ${n.toLowerCase()}`}
            className="absolute inset-0 grid auto-rows-[minmax(44px,1fr)] grid-cols-2 gap-1 overflow-y-auto bg-surface p-1"
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
              className={`flex items-center justify-center rounded-[6px] border border-dashed border-(--cal-ghost) text-[11px] text-ink-4 hover:text-ink ${shot.ref ? '' : OVER}`}
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
            className="absolute inset-0 block"
          >
            <Media src={like.src} sizes="(max-width: 768px) 96px, 220px" />
          </button>
        ) : (
          <button
            ref={frame}
            type="button"
            aria-label={`Pick a reference for ${n.toLowerCase()}`}
            onClick={() => setChoosing(true)}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-[12px] leading-tight text-ink-4 transition-colors hover:text-ink ${over && board.drag?.kind === 'ref' ? 'text-ink' : ''}`}
          >
            Shoot it like…
            <span className="text-[11px] text-ink-5">drop a reference</span>
          </button>
        )}
        {shot.media && !choosing && (
          <span className="absolute right-1.5 bottom-1.5 size-7 overflow-hidden rounded-[6px] shadow-soft ring-2 ring-(--surface)">
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
      <span
        className={`absolute top-4 right-4 flex items-center gap-0.5 rounded-full bg-page/92 p-0.5 text-ink-3 shadow-soft group-hover/shot:opacity-100 ${HOVER} ${choosing ? 'hidden' : ''}`}
      >
        <Nudge
          label={`Move ${n.toLowerCase()} earlier`}
          dir="back"
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
        />
        <Nudge
          label={`Move ${n.toLowerCase()} later`}
          dir="on"
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
        />
        <button
          type="button"
          aria-label={`Remove ${n.toLowerCase()}`}
          onClick={onRemove}
          className="flex size-6 items-center justify-center rounded-full hover:text-ink"
        >
          <CloseIcon />
        </button>
      </span>
    </li>
  )
}

/** Who or what is in frame, and the shoot day: one of the calendar's shoots, or any day. */
function ShotDetails({ card }: { card: IdeaCard }) {
  const { brand, weeks } = useBrand()
  // Two shoots can share a day: each is its own option, and they run in date order.
  const shoots = weeks
    .flatMap((w) =>
      w.events
        .filter((e) => e.layer === 'shoot')
        .flatMap((e) => {
          const day = w.days[e.col - 1]
          return day && !day.past
            ? [
                {
                  key: `${e.text}:${day.n}`,
                  value: day.n,
                  label: `${e.text} · ${dayLabel(weeks, day.n)}`,
                },
              ]
            : []
        }),
    )
    .sort((a, b) => dayIndex(weeks, a.value) - dayIndex(weeks, b.value))
  const days = weeks
    .flatMap((w) => w.days)
    .filter((d) => !d.past && !shoots.some((s) => s.value === d.n))
    .map((d) => ({ value: d.n, label: dayLabel(weeks, d.n) ?? d.n }))
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
        <Select
          label="Shoot day"
          value={card.shootDay ?? ''}
          onChange={(shootDay) => editIdea(brand.id, card.id, { shootDay: shootDay || undefined })}
          options={[
            { value: '', label: 'No shoot day' },
            { group: 'Shoots on the calendar', options: shoots },
            { group: 'Another day', options: days },
          ]}
        />
      </span>
    </div>
  )
}

// ── 03 Shoot ─────────────────────────────────────────────────────────────────────────────────

/**
 * On the day: the shots as a list to tick, each taking the photo or clip it became. Drop a file
 * on a line, or press Add; a shot with media counts as captured.
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
  patchShot: (index: number, fields: Partial<Shot>) => void
}) {
  const { weeks } = useBrand()
  const patch = patchShot
  const shootDay = card.shootDay ? dayLabel(weeks, card.shootDay) : null

  if (card.shots.length === 0) {
    return <p className="text-[14px] text-ink-4">Add shots to the storyboard first.</p>
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-3">
      <p className="text-[13px] text-ink-4">
        {shootDay ? `Shooting ${shootDay}.` : 'No shoot day yet: pick one under Shots.'}
      </p>
      <ol className="flex flex-col">
        {card.shots.map((s, i) => {
          const key = `files:capture:${i}`
          const over = board.over === key
          const like = s.ref ? refs.find((r) => r.key === s.ref) : undefined
          return (
            <li
              key={i}
              onDragOver={(e) => {
                if (!hasFiles(e)) return
                e.preventDefault()
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
                  ([m]) => m && patch(i, { media: m, captured: true }),
                )
              }}
              className={`-mx-3 grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-4 rounded-[12px] px-3 py-2.5 transition-colors ${over ? 'bg-(--cal-drop)' : ''}`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={!!s.captured}
                aria-label={`Captured: ${s.title || `${unitOf(card)} ${i + 1}`}`}
                onClick={() => patch(i, { captured: !s.captured })}
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${s.captured ? 'border-(--insight-5) bg-(--insight-5) text-page' : 'border-(--line-strong) hover:border-ink-3'}`}
              >
                {s.captured && <CheckIcon size={9} strokeWidth={2.4} />}
              </button>
              <span className="flex min-w-0 flex-col">
                <span className={`truncate text-[15px] ${s.captured ? 'text-ink-4' : 'text-ink'}`}>
                  {s.title || `${unitOf(card)} ${i + 1}`}
                </span>
                {like && <span className="text-[12px] text-ink-4">like {like.owner}</span>}
              </span>
              <MediaSlot
                shot={s}
                label={s.title || `${unitOf(card)} ${i + 1}`}
                over={over}
                onMedia={(media) => patch(i, { media, captured: true })}
                onClear={() => patch(i, { media: undefined })}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** A shot's photo or clip: the thumbnail once it is here, else a small dashed Add. */
function MediaSlot({
  shot,
  label,
  over,
  onMedia,
  onClear,
}: {
  shot: Shot
  label: string
  over: boolean
  onMedia: (media: string) => void
  onClear: () => void
}) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <span className="group/media relative flex">
      {shot.media ? (
        <>
          <span className="relative block size-12 overflow-hidden rounded-[8px] bg-tile">
            <Media src={shot.media} sizes="48px" />
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
          className={`flex h-12 items-center gap-1.5 rounded-[8px] border border-dashed px-3 text-[12px] transition-colors ${over ? 'border-ink-3 text-ink' : 'border-(--cal-ghost) text-ink-4 hover:border-(--line-strong) hover:text-ink'}`}
        >
          <PlusIcon size={10} />
          {over ? 'Drop it' : 'Add the clip'}
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

// ── 04 Post ──────────────────────────────────────────────────────────────────────────────────

/** Status, date and time, where the idea stands on the calendar, and what the post carries. */
function PlanSection({ slot, plan }: { slot: Slot; plan: Plan }) {
  const { weeks } = useBrand()
  const { card, status, dayN } = slot
  const step = stepOf(status)
  const { media, fromShoot } = plan
  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Plan" className="flex flex-col gap-3">
        <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 text-[13px]">
          <span className="pt-1.5 text-ink-4">Status</span>
          <StatusPicker value={step} onChange={plan.setStatus} />
          <span className="pt-1.5 text-ink-4">Post</span>
          <span className="flex flex-wrap items-center gap-2">
            <Select
              label="Post date"
              disabled={step === 'posted'}
              value={dayN ?? ''}
              onChange={plan.setDate}
              options={[
                ...(dayN ? [] : [{ value: '', label: 'No date', disabled: true }]),
                ...plan.days.map((d) => ({ value: d.n, label: d.label, disabled: d.taken })),
              ]}
            />
            <Select
              label="Post time"
              disabled={step === 'posted'}
              value={plan.time}
              onChange={plan.setTime}
              options={TIMES.map((t) => ({ value: t, label: t }))}
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
      <section aria-label="Media" className="flex flex-col gap-2.5">
        <span className={`${EYEBROW} flex items-center gap-2`}>
          The post carries
          <span className="text-ink-5 tabular-nums">{media.length}</span>
        </span>
        {media.length > 0 ? (
          <ol className="flex flex-wrap gap-2">
            {media.map((m, i) => (
              <li key={m} className="relative size-16 overflow-hidden rounded-[10px] bg-tile">
                <Media src={m} sizes="64px" />
                <span className="absolute bottom-1 left-1 rounded-full bg-page/90 px-1.5 font-mono text-[9px] text-ink">
                  {i + 1}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        <span className="text-[12px] text-ink-4">
          {fromShoot > 0
            ? `${fromShoot} from the shoot, in shot order.`
            : media.length > 0
              ? `${card.postId ? "The post's media" : 'Your photo'}. What the shoot captures takes its place, in shot order.`
              : 'Nothing yet. What the shoot captures lands here, in shot order.'}
        </span>
      </section>
    </div>
  )
}

/** The three steps; the current one filled. Each step sets the post's stage on the calendar. */
function StatusPicker({ value, onChange }: { value: Step; onChange: (s: Step) => void }) {
  return (
    <span role="radiogroup" aria-label="Status" className="flex flex-wrap gap-1">
      {CHIPS.map((c) => {
        const on = c === value
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c)}
            className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-3 hover:text-ink'}`}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ background: on ? 'var(--page)' : statusColour(c) }}
            />
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

type Option = { value: string; label: string; disabled?: boolean; key?: string }

function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  options: Array<Option | { group: string; options: Option[] }>
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const option = (o: Option) => (
    <option key={o.key ?? o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  )
  return (
    <span className="relative flex">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 cursor-pointer appearance-none rounded-full bg-surface pr-7 pl-3 text-[12.5px] font-medium text-ink outline-none hover:bg-paper focus-visible:shadow-[0_0_0_2px_var(--ink)] disabled:cursor-default disabled:opacity-50"
      >
        {options.map((o) =>
          'group' in o
            ? o.options.length > 0 && (
                <optgroup key={o.group} label={o.group}>
                  {o.options.map(option)}
                </optgroup>
              )
            : option(o),
        )}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-4">
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  )
}
