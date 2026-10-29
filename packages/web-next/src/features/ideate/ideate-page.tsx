'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Segmented } from '@/components/controls'
import {
  ArrowUpRightIcon,
  CheckIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
  SparkIcon,
} from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import { MOODBOARD_ACCOUNT, moodboardTag, PINTEREST_ACCOUNT } from '@/data/brand-kit'
import {
  boardsOf,
  IDEAS_BY_BRAND,
  moodboardOf,
  inspirationOf,
  pastedReferences,
  type IdeaCard,
  type IdeaFormat,
  type Moment,
  type Reference,
} from '@/data/ideas'
import { BrandLogo } from '@/features/brand/brand-logo'
import { dayOf } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'
import { planShoot } from '@/features/shoot/shoots-store'
import { NotAvailable, notAvailable, reasonOf } from '@/features/connections/not-available'
import { demoOf, newId, remote, RemoteError, report } from '@/lib/remote'

import { EYEBROW, FormatIcon, STATUS_LABEL, statusColour, useSlots, type Slot } from './idea-parts'
import { dayLabel, dayOfHook, landingDay } from './calendar-slot'
import {
  addIdea,
  addIdeaFromPosts,
  connectSource,
  saveBoards,
  pasteLink,
  skipSuggestion,
  suggest,
  useIdeas,
  type MoodSource,
} from './ideas-store'
import { IDEAS_HREF } from './idea-page'
import {
  MAX_BOARDS,
  pinterestIdOf,
  pinterestSetup,
  startPinterest,
  type PinterestSetup,
} from './pinterest'

const FORMAT_LABEL: Record<IdeaFormat, string> = {
  reel: 'Reel',
  carousel: 'Carousel',
  story: 'Story',
}

type View = 'ideas' | 'board'

/**
 * The ideas page, in two views. "Moodboard", the default, is one board of everything the team
 * saved for the brand, from Pinterest and Instagram DMs: pick any number of posts and plan an idea from them.
 * "Current ideas" is the overview: every idea with the posts it grew from, its hook and where it
 * stands. Each idea has its own page (`/ideate/<id>`); `?view=ideas` brings Back to the overview.
 */
export function IdeatePage({ view: initial }: { view?: View }) {
  const { brand } = useBrand()
  const slots = useSlots()
  // The moodboard first: ideas start from what the team saved.
  const [picked, setView] = React.useState<View | null>(null)
  const view = picked ?? initial ?? 'board'
  const [toast, setToast] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const router = useRouter()

  /** A new idea from the moodboard opens on its own page, where its brief gets written. */
  function planned(id: string) {
    router.push(ideaHref(id))
  }

  /** The view goes in the URL too, so the browser's Back from an idea lands on the same view. */
  function choose(v: View) {
    setView(v)
    router.replace(v === 'ideas' ? IDEAS_HREF : '/ideate', { scroll: false })
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      {/* The title settles in with the page, as on Schedule, Insights and Inbox. */}
      <div
        key={brand.id}
        className="bb-swap mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-10 pt-6 pb-8 max-md:px-4 max-md:pt-2 max-md:pb-5"
      >
        <h1 className="font-display tracking-[-0.035em] text-[56px] leading-none max-md:text-[34px]">
          Ideas
        </h1>
        <div className="w-[240px] max-md:w-full">
          <Segmented
            label="View"
            pill
            value={view}
            onChange={choose}
            options={[
              { value: 'board', label: 'Moodboard' },
              { value: 'ideas', label: 'Current ideas' },
            ]}
          />
        </div>
      </div>

      <main
        key={`${brand.id}-${view}`}
        className="bb-swap mx-auto w-full max-w-[1440px] px-10 pb-16 max-md:px-4"
      >
        {view === 'ideas' ? (
          <Ideas slots={slots} onToast={setToast} onNew={() => choose('board')} />
        ) : (
          <Board onPlanned={planned} />
        )}
      </main>

      {toast && (
        <div
          role="status"
          className="bb-rise fixed right-6 bottom-6 z-50 flex h-11 items-center gap-3 rounded-full bg-ink pr-2 pl-4 text-[13px] font-medium text-page shadow-lift max-md:right-4 max-md:bottom-[calc(76px+env(safe-area-inset-bottom))]"
        >
          <span className="flex size-4 items-center justify-center rounded-full bg-(--insight-5) text-page">
            <CheckIcon size={8} strokeWidth={2.2} />
          </span>
          {toast}
          <Link
            href="/"
            className="flex h-8 items-center rounded-full bg-page px-3 text-[12.5px] text-ink hover:opacity-85"
          >
            Open
          </Link>
        </div>
      )}
    </div>
  )
}

/** An idea's own page. */
const ideaHref = (id: string) => `/ideate/${id}`

// ── Current ideas ────────────────────────────────────────────────────────────────────────────

const GRID =
  'grid grid-cols-4 gap-x-6 gap-y-10 max-xl:grid-cols-3 max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-7'
const HOOK = 'font-display text-[20px] leading-[1.15] tracking-[-0.01em] max-md:text-[16px]'
const ACT = 'text-[13px] font-medium transition-colors'

/**
 * Every idea at once, each with the posts it grew from. Under them, the moments ahead not used
 * yet. "Plan it" puts an idea on the calendar's next free day; the idea's page, opened from any
 * card, does the rest.
 */
function Ideas({
  slots,
  onToast,
  onNew,
}: {
  slots: Slot[]
  onToast: (t: string) => void
  onNew: () => void
}) {
  const { brand, weeks, byId, addIdeaToCalendar } = useBrand()
  const { ideas, suggesting, target } = useIdeas(brand.id)
  const router = useRouter()
  // Picking ideas to shoot together: null while the cards open their pages.
  const [picking, setPicking] = React.useState<string[] | null>(null)
  const togglePick = (id: string) =>
    setPicking((p) => (p ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]))
  /** The picked ideas become one shoot, whose call sheet opens to set the day and the crew. */
  function shootPicked() {
    if (!picking?.length) return
    router.push(`/shoot/${planShoot(brand.id, weeks, picking)}`)
  }

  // A moment already used is one of the ideas now, so it leaves the list. Its idea is found by
  // the moment's title, which a sharper hook does not change, or else by its hook on the calendar.
  const moments = (demoOf(IDEAS_BY_BRAND, brand.id)?.moments ?? []).filter(
    (m) =>
      !ideas.some((i) => i.source.kind === 'moment' && i.source.title === m.title) &&
      !dayOfHook(weeks, m.seed.hook, (id) => byId(id)?.hook),
  )
  // The month's target is feed posts; stories ride alongside and do not fill a slot.
  const own = ideas.filter((i) => i.status !== 'suggested' && i.format !== 'story').length
  const open = Math.max(target - own, 0)

  /** The idea takes the calendar's next free day; a story has no tile, so its page opens. */
  function plan(card: IdeaCard) {
    if (card.format === 'story') return router.push(ideaHref(card.id))
    const why =
      card.source.kind === 'insight'
        ? card.source.line
        : card.source.kind === 'moment'
          ? card.source.title
          : 'Team idea'
    const where = addIdeaToCalendar(
      { ideaId: card.id, format: card.format, hook: card.hook, why },
      card.date,
    )
    if (!where) return router.push(ideaHref(card.id))
    onToast(`On the calendar · ${where}`)
  }

  function takeMoment(m: Moment) {
    const date = landingDay(weeks, m.date)
    if (!date || m.seed.format === 'story') return
    const where = addIdeaToCalendar(
      { format: m.seed.format, hook: m.seed.hook, why: m.title },
      date,
    )
    if (!where) return
    addIdea(brand.id, { ...m.seed, date }, { kind: 'moment', title: m.title })
    onToast(`On the calendar · ${where}`)
  }

  return (
    <div className="flex flex-col gap-14">
      <section aria-label="Ideas" className="flex flex-col gap-6">
        {picking ? (
          <div
            role="region"
            aria-label="Selection"
            className="sticky top-0 z-30 -mx-10 flex h-[52px] items-center gap-3 bg-page px-10 max-md:-mx-4 max-md:px-4"
          >
            <button
              type="button"
              aria-label="Stop selecting"
              onClick={() => setPicking(null)}
              className="-ml-2 flex size-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
            >
              <CloseIcon />
            </button>
            <span className="text-[13px] font-medium tabular-nums">
              {picking.length ? `${picking.length} selected` : 'Pick the ideas to shoot together'}
            </span>
            <button
              type="button"
              onClick={shootPicked}
              disabled={picking.length === 0}
              className="bb-press ml-auto flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-30"
            >
              Plan a shoot
            </button>
          </div>
        ) : (
          <div className="flex h-9 items-center justify-end">
            <span className="flex items-center gap-1">
              {/* Nothing to pick from: no way to start picking. */}
              {slots.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPicking([])}
                  className="flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                >
                  Select
                </button>
              )}
              {!suggesting && open > 0 && (
                <button
                  type="button"
                  onClick={() => suggest(brand.id)}
                  className="flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-(--insight-6) transition-colors hover:bg-(--insight-wash)"
                >
                  <SparkIcon size={10} />
                  Suggest {open}
                </button>
              )}
            </span>
          </div>
        )}
        <ul className={GRID}>
          {slots.map((slot) => (
            <li key={slot.card.id}>
              <IdeaView
                slot={slot}
                onPlan={() => plan(slot.card)}
                picked={picking?.includes(slot.card.id) ?? null}
                onPick={() => togglePick(slot.card.id)}
              />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={onNew}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-(--cal-ghost) text-ink-4 transition-colors hover:border-(--line-strong) hover:text-ink"
            >
              <PlusIcon size={14} />
              <span className="text-[13px] font-medium">New idea</span>
            </button>
          </li>
        </ul>
      </section>

      {moments.length > 0 && (
        <section aria-label="Moments ahead" className="flex flex-col gap-6">
          <span className={`${EYEBROW} flex h-9 items-center`}>Moments ahead</span>
          <ul className={GRID}>
            {moments.map((m) => (
              <li key={m.id}>
                <MomentView moment={m} onUse={() => takeMoment(m)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** One idea in the overview: its collage, its hook and where it stands. The card opens its page. */
function IdeaView({
  slot,
  onPlan,
  picked,
  onPick,
}: {
  slot: Slot
  onPlan: () => void
  /** Whether it is picked for a shoot; null when nothing is being picked. */
  picked: boolean | null
  onPick: () => void
}) {
  const { brand } = useBrand()
  const { card, status, label, placed } = slot
  const suggested = status === 'suggested'
  const href = ideaHref(card.id)
  const photos = [card.image, ...inspirationOf(brand.id, card).map((p) => p.image)].filter(
    (src, i, a): src is string => Boolean(src) && a.indexOf(src) === i,
  )
  const source = sourceOf(card)

  // A suggestion is not the team's yet, so it is not shot.
  const picking = picked !== null && !suggested
  return (
    <article
      className={`relative flex flex-col gap-3 ${picked === null || picking ? '' : 'opacity-40'}`}
    >
      {picking && (
        <button
          type="button"
          aria-pressed={picked}
          aria-label={`Shoot: ${card.hook}`}
          onClick={onPick}
          className="absolute inset-0 z-10 rounded-[14px] focus-visible:shadow-[0_0_0_2px_var(--ink)] focus-visible:outline-none"
        >
          <span
            className={`absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full transition-colors ${picked ? 'bg-ink text-page shadow-[0_0_0_1.5px_var(--page)]' : 'bg-white/70 shadow-[inset_0_0_0_1.5px_rgba(18,18,18,0.35)] backdrop-blur-md'}`}
          >
            {picked && <CheckIcon size={10} strokeWidth={2.2} />}
          </span>
        </button>
      )}
      <Link
        href={href}
        aria-label={`Open the idea: ${card.hook}`}
        className="group/card flex w-full flex-col gap-3 text-left"
      >
        <Collage photos={photos} format={card.format} suggested={suggested} />
        <span className="flex flex-col gap-1.5 px-0.5">
          <span className={HOOK}>{card.hook}</span>
          {source && (
            <span className="truncate text-[12px]" style={{ color: source.colour }}>
              {source.text}
            </span>
          )}
          <span className="flex items-center gap-2 text-[12px] text-ink-4">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: statusColour(status) }}
            />
            <span className="truncate">
              {[STATUS_LABEL[status], label].filter(Boolean).join(' · ')}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <FormatIcon format={card.format} size={10} />
              {FORMAT_LABEL[card.format]}
            </span>
          </span>
        </span>
      </Link>
      {/* The card opens the idea; under it, only what the card itself cannot do. */}
      {suggested ? (
        <span className="flex items-center gap-4 px-0.5">
          <Link href={href} className={`${ACT} text-ink hover:opacity-70`}>
            Review
          </Link>
          <button
            type="button"
            onClick={() => skipSuggestion(brand.id, card.id)}
            className={`${ACT} text-ink-3 hover:text-ink`}
          >
            Skip
          </button>
        </span>
      ) : (
        !placed && (
          <button
            type="button"
            onClick={onPlan}
            className={`${ACT} self-start px-0.5 text-ink hover:opacity-70`}
          >
            Plan it
          </button>
        )
      )}
    </article>
  )
}

/** Where the idea came from, in one quiet line, when the photos alone do not say it. */
function sourceOf(card: IdeaCard): { text: string; colour: string } | null {
  const s = card.source
  if (s.kind === 'insight') return { text: s.line, colour: 'var(--insight-6)' }
  if (s.kind === 'moment') return { text: s.title, colour: 'var(--layer-holiday-ink)' }
  if (s.kind === 'suggested' && card.builtOn)
    return { text: `Built on “${card.builtOn.idea.hook}”`, colour: 'var(--insight-6)' }
  if (s.kind === 'reference') return { text: s.account, colour: 'var(--ink-3)' }
  return null
}

/**
 * The idea's photos: its own first, then its inspiration posts. One photo fills the frame; two
 * share it; three or more leave the first large with two beside it, and "+N" counts the rest.
 */
function Collage({
  photos,
  format,
  suggested,
}: {
  photos: string[]
  format: IdeaFormat
  suggested: boolean
}) {
  const { brand } = useBrand()
  const shown = photos.slice(0, 3)
  const more = photos.length - shown.length
  const span = (i: number) =>
    i === 0
      ? shown.length === 1
        ? 'col-span-3 row-span-2'
        : 'col-span-2 row-span-2'
      : shown.length === 2
        ? 'row-span-2'
        : ''
  return (
    <span className="relative grid aspect-[4/3] w-full grid-cols-3 grid-rows-2 gap-1 overflow-hidden rounded-[14px] bg-tile">
      {shown.length === 0 && (
        <span
          className="col-span-3 row-span-2 flex items-center justify-center text-ink/30"
          style={{
            background: `linear-gradient(165deg, color-mix(in oklab, var(${brand.colour}) 20%, var(--page)) 0%, var(--tile) 90%)`,
          }}
        >
          <FormatIcon format={format} size={22} />
        </span>
      )}
      {shown.map((src, i) => (
        <span key={src} className={`relative overflow-hidden bg-tile ${span(i)}`}>
          <Image
            src={src}
            alt=""
            fill
            sizes="(max-width: 768px) 50vw, 320px"
            className="object-cover transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] group-hover/card:scale-[1.03]"
          />
          {i === shown.length - 1 && more > 0 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 font-mono text-[12px] text-white">
              +{more}
            </span>
          )}
        </span>
      ))}
      {suggested && (
        <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-white/85 text-(--insight-6) shadow-[0_1px_6px_rgba(0,0,0,0.18)] backdrop-blur-md">
          <SparkIcon size={10} />
        </span>
      )}
    </span>
  )
}

/** A moment nearby, pitched like an idea: use it and it lands on the calendar's next open day. */
function MomentView({ moment, onUse }: { moment: Moment; onUse: () => void }) {
  const [, day, month] = moment.when.split(' ')
  return (
    <article className="flex flex-col gap-3">
      <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-[14px] bg-(--layer-holiday) text-(--layer-holiday-ink)">
        <span className="font-display text-[56px] leading-none tracking-[-0.04em] max-md:text-[44px]">
          {day}
        </span>
        <span className={EYEBROW}>{month}</span>
      </span>
      <span className="flex flex-col gap-1.5 px-0.5">
        <span className={HOOK}>{moment.seed.hook}</span>
        <span className="truncate text-[12px] text-(--layer-holiday-ink)">{moment.title}</span>
        <span className="flex items-center gap-2 text-[12px] text-ink-4">
          <span className="truncate">{moment.near}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <FormatIcon format={moment.seed.format} size={10} />
            {FORMAT_LABEL[moment.seed.format]}
          </span>
        </span>
      </span>
      <button
        type="button"
        onClick={onUse}
        className={`${ACT} self-start px-0.5 text-ink hover:opacity-70`}
      >
        Use it
      </button>
    </article>
  )
}

// ── Moodboard ────────────────────────────────────────────────────────────────────────────────

const SOURCE_NAME: Record<MoodSource, string> = {
  pinterest: 'Pinterest',
  dm: 'Instagram DMs',
  tt: 'TikTok',
}

/** Where a post itself is from: a DM or a pasted link may carry a TikTok. */
const PLATFORM_NAME: Record<Reference['platform'], string> = {
  pinterest: 'Pinterest',
  ig: 'Instagram',
  tt: 'TikTok',
}

const CHIP_ON = 'bg-ink text-page'
const CHIP_OFF = 'bg-surface text-ink-2 hover:bg-paper hover:text-ink'
/** On a screen with no hover (touch): shown always, since nothing would reveal it. */
const NO_HOVER_SHOWN = '[@media(hover:none)]:opacity-100'
/** The board picker gets a search field once an account has more boards than this. */
const SEARCH_FROM = 6

/**
 * The folder chips in one line that never wraps: it scrolls sideways, and an edge with more
 * chips past it fades out.
 */
function ChipRow({ children }: { children: React.ReactNode }) {
  const row = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ start: false, end: false })
  const measure = React.useCallback(() => {
    const el = row.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }))
  }, [])
  React.useEffect(() => {
    const el = row.current
    if (!el) return
    el.addEventListener('scroll', measure, { passive: true })
    return () => el.removeEventListener('scroll', measure)
  }, [measure])
  // The row and each chip are watched, so a chip added, removed or grown (its confirm label)
  // measures the row again. Watched afresh each render, since the chips may have changed.
  React.useEffect(() => {
    const el = row.current
    if (!el) return
    const resize = new ResizeObserver(measure)
    resize.observe(el)
    for (const chip of el.children) resize.observe(chip)
    return () => resize.disconnect()
  })
  const fade = (on: boolean) => (on ? 'transparent' : '#000')
  const mask = `linear-gradient(to right, ${fade(edges.start)}, #000 28px, #000 calc(100% - 28px), ${fade(edges.end)})`
  return (
    <div
      ref={row}
      role="tablist"
      aria-label="Folders"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="-my-1 flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  )
}

/**
 * A live Pinterest board's chip. A small × fades in on hover or focus (on a touch screen, on the
 * chosen chip only) and removes the board at once: the "+" picker adds it back in two clicks.
 */
function BoardChip({
  label,
  on,
  busy,
  onSelect,
  onRemove,
}: {
  label: string
  on: boolean
  busy: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const shown = `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${on ? NO_HOVER_SHOWN : '[@media(hover:none)]:pointer-events-none'}`

  return (
    <span
      className={`group relative flex h-9 shrink-0 items-center rounded-full transition-colors ${on ? CHIP_ON : CHIP_OFF} ${busy ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={onSelect}
        className="flex h-9 items-center gap-2 rounded-full pr-8 pl-4 text-[13px] font-medium"
      >
        <PlatformLogo platform="pinterest" size={11} />
        {label}
      </button>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        disabled={busy}
        onClick={onRemove}
        className={`absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full transition-opacity duration-150 hover:bg-current/10 ${shown}`}
      >
        <CloseIcon size={8} />
      </button>
    </span>
  )
}

/** Instagram DMs carry Instagram's logo. */
const SOURCE_LOGO: Record<MoodSource, 'pinterest' | 'ig' | 'tt'> = {
  pinterest: 'pinterest',
  dm: 'ig',
  tt: 'tt',
}

/**
 * The moodboard: one board for everything the team saved for this brand. Three sources: the
 * brand's board on the team's one Pinterest account, posts DM'd to the moodboard account on
 * Instagram with the brand's tag (Instagram does not let an app read saved posts), and the brand's
 * TikTok saves. Each source connects in a short mock step (no backend). Tap posts to pick them; a
 * bar then plans an idea from them.
 */
function Board({ onPlanned }: { onPlanned: (id: string) => void }) {
  const { brand } = useBrand()
  const { sources } = useIdeas(brand.id)
  const { references } = moodboardOf(brand.id)
  const boards = boardsOf(brand.id)
  const [filter, setFilter] = React.useState<string>('all')
  // Pasted links live in the data module, so an idea keeps them and they outlast a view switch.
  // Read on every render: a paste and a reload from the server both notify the ideas store.
  const pasted = pastedReferences(brand.id)
  // The posts picked, in the order they were picked: the first lends the idea its words.
  const [selected, setSelected] = React.useState<string[]>([])
  // Whether a source is being added from the one "+" chip, shown under the chip row. Until the
  // person opens or closes it, it is open when the page came back from a sign-in, ready for that
  // source's next step.
  const [addingSet, setAdding] = React.useState<boolean | null>(null)
  const asked = useSetupAsked()
  const adding = addingSet ?? asked !== null
  const top = React.useRef<HTMLDivElement>(null)
  // Where the chip that opened the setup starts, so on a wide screen the setup opens under it.
  const [anchor, setAnchor] = React.useState(0)
  const [removing, setRemoving] = React.useState(false)

  // The setup floats over the board like a menu: a tap outside or Escape closes it.
  React.useEffect(() => {
    if (!adding) return
    const close = (e: PointerEvent) => {
      if (!top.current?.contains(e.target as Node)) setAdding(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAdding(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [adding])

  // A source just connected: the popover closes, so it never jumps to a source nobody picked.
  const linked = Object.values(sources).filter(Boolean).length
  const [linkedBefore, setLinkedBefore] = React.useState(linked)
  if (linkedBefore !== linked) {
    setLinkedBefore(linked)
    setAdding(false)
  }

  if (!sources.pinterest && !sources.dm && !sources.tt) return <ConnectSources />

  // The brand's boards on Pinterest, everything sent by DM or pasted as a link, then the brand's
  // TikTok saves. Pins come only from the boards.
  const folders: Array<{
    id: string
    label: string
    source: MoodSource
    pins: Reference[]
    url?: string
  }> = [
    ...(sources.pinterest
      ? boards.map((b) => ({
          id: b.id,
          label: b.name,
          source: 'pinterest' as const,
          pins: b.pins,
          url: b.url,
        }))
      : []),
    ...(sources.dm
      ? [
          {
            id: 'dm',
            label: 'Shared',
            source: 'dm' as const,
            pins: [...pasted, ...references.filter((r) => r.platform === 'ig')].filter(
              (r) => r.platform !== 'pinterest',
            ),
          },
        ]
      : []),
    ...(sources.tt
      ? [
          {
            id: 'tt',
            label: 'TikTok saves',
            source: 'tt' as const,
            pins: references.filter((r) => r.platform === 'tt'),
          },
        ]
      : []),
  ]
  // One board: the folders dealt in turn, so every source shows near the top.
  const longest = Math.max(0, ...folders.map((f) => f.pins.length))
  const all = Array.from({ length: longest }, (_, i) => folders.flatMap((f) => f.pins[i] ?? []))
    .flat()
    .filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i)
  const current = folders.find((f) => f.id === filter)
  const shown = current ? current.pins : all
  const missing = (Object.keys(SOURCE_NAME) as MoodSource[]).filter((k) => !sources[k])
  // On the core, once Pinterest reads a board, the "+" picks the boards: the other sources cannot
  // connect there yet.
  const livePinterest = remote && sources.pinterest && !notAvailable('pinterest')
  const choices: MoodSource[] = livePinterest ? ['pinterest'] : missing
  const chips = [
    { id: 'all', label: 'All', source: null, url: undefined },
    ...folders.map((f) => ({ id: f.id, label: f.label, source: f.source, url: f.url })),
  ]
  const picked = selected.flatMap((id) => all.find((p) => p.id === id) ?? [])

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function clear() {
    setSelected([])
  }

  /** The picked posts become an idea at once, worded from the first; its page does the rest. */
  function plan() {
    const id = addIdeaFromPosts(brand.id, picked)
    clear()
    onPlanned(id)
  }

  /** Where a popover opens: under the chip `el`, kept on screen near the right edge. */
  function anchorAt(el: HTMLElement, width: number) {
    const row = top.current?.getBoundingClientRect()
    const chip = el.getBoundingClientRect()
    if (row) setAnchor(Math.max(0, Math.min(chip.left - row.left, row.width - width - 40)))
  }

  /** Takes a board off the moodboard; the last one turns Pinterest off. The account stays. */
  async function remove(id: string) {
    if (removing) return
    setFilter('all')
    setRemoving(true)
    try {
      await saveBoards(brand.id, boards.filter((b) => b.id !== id).map(pinterestIdOf))
    } catch (err) {
      report(message(err))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The top row stays in view: the folders, or, once posts are picked, what to do with them. */}
      <div
        ref={top}
        className="sticky top-0 z-30 -mx-10 bg-page px-10 py-2 max-md:-mx-4 max-md:px-4"
      >
        {picked.length > 0 ? (
          <div role="region" aria-label="Selection" className="flex h-9 items-center gap-3">
            <button
              type="button"
              aria-label="Clear the selection"
              onClick={clear}
              className="-ml-2 flex size-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
            >
              <CloseIcon />
            </button>
            <span className="text-[13px] font-medium tabular-nums">{picked.length} selected</span>
            <button
              type="button"
              onClick={plan}
              className="bb-press ml-auto flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-page hover:opacity-85"
            >
              Plan idea from this
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <ChipRow>
              {chips.map((c) => {
                const on = c.id === filter
                if (c.url) {
                  return (
                    <BoardChip
                      key={c.id}
                      label={c.label}
                      on={on}
                      busy={removing}
                      onSelect={() => setFilter(c.id)}
                      onRemove={() => void remove(c.id)}
                    />
                  )
                }
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setFilter(c.id)}
                    className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors ${on ? CHIP_ON : CHIP_OFF}`}
                  >
                    {c.source && <PlatformLogo platform={SOURCE_LOGO[c.source]} size={11} />}
                    {c.label}
                  </button>
                )
              })}
            </ChipRow>
            {choices.length > 0 && (
              <button
                type="button"
                aria-label={livePinterest ? 'Pinterest boards' : 'Add a source'}
                aria-expanded={adding}
                onClick={(e) => {
                  // Kept on screen: a chip near the right edge opens the setup leftwards.
                  anchorAt(e.currentTarget, 360)
                  setAdding(!adding)
                }}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 shadow-[inset_0_0_0_1px_var(--cal-ghost)] transition-colors hover:text-ink"
              >
                <PlusIcon size={12} />
              </button>
            )}
          </div>
        )}
        {adding && choices.length > 0 && (
          <div
            style={{ '--x': `${anchor}px` } as React.CSSProperties}
            className="bb-pop absolute top-full left-(--x) mt-1 w-[360px] rounded-[18px] bg-page p-5 shadow-[0_0_0_1px_var(--line),0_16px_40px_-16px_rgba(0,0,0,0.22)] max-md:right-4 max-md:left-4 max-md:w-auto"
          >
            <AddSource missing={choices} initial={asked} onDone={() => setAdding(false)} />
          </div>
        )}
      </div>
      {filter === 'dm' && (
        <div className="flex max-w-[420px] flex-col gap-2">
          <PasteLink
            onPaste={(r) => {
              pasteLink(brand.id, r)
            }}
          />
          <DmHint />
        </div>
      )}
      <Masonry key={filter} pins={shown} selected={selected} onToggle={toggle} />
    </div>
  )
}

const noSubscribe = () => () => undefined

/** The source the address asks to set up, or none; never on the server. */
function setupInAddress(): MoodSource | null {
  const source = new URLSearchParams(window.location.search).get('setup')
  return source && Object.hasOwn(SOURCE_NAME, source) ? (source as MoodSource) : null
}

/**
 * The source a link asks to set up (`/ideate?setup=pinterest`, where the Pinterest sign-in comes
 * back to). Read from the address on the client only, so the server's page and the first client
 * render agree.
 */
function useSetupAsked(): MoodSource | null {
  return React.useSyncExternalStore(noSubscribe, setupInAddress, () => null)
}

/** One more source for the board: the only one left sets up at once; otherwise, pick first. */
function AddSource({
  missing,
  initial,
  onDone,
}: {
  missing: MoodSource[]
  initial?: MoodSource | null
  /** After the Pinterest boards are saved. */
  onDone?: () => void
}) {
  const [picked, setPicked] = React.useState<MoodSource | null>(initial ?? null)
  const source = missing.length === 1 ? missing[0]! : picked
  if (source) return <SourceSetup source={source} onDone={onDone} />
  return (
    <div className="flex flex-col gap-1 text-left">
      {missing.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setPicked(m)}
          className="flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-colors hover:bg-surface"
        >
          <PlatformLogo platform={SOURCE_LOGO[m]} size={13} />
          {SOURCE_NAME[m]}
        </button>
      ))}
    </div>
  )
}

/** How a post reaches this brand's board by DM, in one line, with the tag to type. */
function DmHint() {
  const { brand } = useBrand()
  return (
    <p className="px-4 text-[12px] text-ink-4">
      Or share any post or reel by DM to{' '}
      <span className="font-medium text-ink-2">{MOODBOARD_ACCOUNT}</span> with{' '}
      <span className="font-medium text-ink-2">{moodboardTag(brand)}</span>.
    </p>
  )
}

/** The platform each moodboard source reads from, and its name. */
const PLATFORM: Record<MoodSource, string> = { pinterest: 'pinterest', dm: 'ig', tt: 'tt' }
const NAME: Record<MoodSource, string> = { pinterest: 'Pinterest', dm: 'Instagram', tt: 'TikTok' }

/**
 * Setting up one source. Pinterest on the core, once the server has its app set up: the brand's
 * own Pinterest account and the boards on it the moodboard reads. In the static demo,
 * Pinterest is the team's one account with a board per brand. Instagram: the steps to DM a post
 * to the moodboard account, then a button to turn the source on.
 */
function SourceSetup({ source, onDone }: { source: MoodSource; onDone?: () => void }) {
  if (remote && source === 'pinterest' && !notAvailable('pinterest')) {
    return <PinterestSetup onDone={onDone} />
  }
  return <DemoSetup source={source} />
}

/** A short pretend step, or on the core the amber state, since it cannot connect yet. */
function DemoSetup({ source }: { source: MoodSource }) {
  const { brand, brands } = useBrand()
  const [busy, setBusy] = React.useState(false)

  function connect() {
    if (busy) return
    setBusy(true)
    window.setTimeout(() => connectSource(brand.id, source), 900)
  }

  // On the core none of these can connect yet: the amber state in place of a pretend Connect.
  const action = (label: string) =>
    notAvailable(PLATFORM[source]) ? (
      <NotAvailable reason={reasonOf(NAME[source])} align="left" />
    ) : (
      <button
        type="button"
        onClick={connect}
        className="bb-press flex h-10 items-center justify-center gap-2 self-start rounded-full bg-ink px-5 text-[13.5px] font-medium text-page hover:opacity-85"
      >
        {busy && (
          <span className="size-3 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
        )}
        {busy ? 'Connecting…' : label}
      </button>
    )

  if (source === 'tt') {
    return (
      <div className="flex flex-col gap-4 text-left">
        <span className={EYEBROW}>TikTok · {brand.handle}</span>
        <p className="text-[13.5px] text-ink-2">
          Videos saved on {brand.name}’s TikTok land on its moodboard.
        </p>
        {action('Connect TikTok')}
      </div>
    )
  }

  if (source === 'dm') {
    return (
      <div className="flex flex-col gap-4 text-left">
        <span className={EYEBROW}>Instagram · {MOODBOARD_ACCOUNT}</span>
        <ol className="flex flex-col gap-2 text-[13.5px] text-ink-2">
          <li>1. On Instagram, tap Share on any post or reel.</li>
          <li>
            2. Send it to <span className="font-medium text-ink">{MOODBOARD_ACCOUNT}</span> with{' '}
            <span className="font-medium text-ink">{moodboardTag(brand)}</span>.
          </li>
          <li>3. It lands on {brand.name}’s moodboard.</li>
        </ol>
        {action('Turn on')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 text-left">
      <span className={EYEBROW}>Pinterest · {PINTEREST_ACCOUNT}</span>
      <div role="radiogroup" aria-label="Boards" className="flex flex-col">
        {brands.map((b) => {
          const own = b.id === brand.id
          const pins = boardsOf(b.id).reduce((n, s) => n + s.pinCount, 0)
          return (
            <span
              key={b.id}
              role="radio"
              aria-checked={own}
              aria-disabled={!own}
              aria-label={`${b.name} board`}
              className={`flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 ${own ? '' : 'opacity-45'}`}
            >
              <span className="relative size-7 shrink-0 overflow-hidden rounded-full">
                <BrandLogo brandId={b.id} sizes="56px" />
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-[13.5px] font-medium">{b.name}</span>
                <span className="text-[12px] text-ink-4">
                  {pins} pins{own ? '' : ` · on ${b.name}’s moodboard`}
                </span>
              </span>
              {own && <CheckIcon size={13} />}
            </span>
          )
        })}
      </div>
      {action(`Connect ${brand.name}’s board`)}
    </div>
  )
}

/**
 * Pinterest on the core: the brand signs in with its own Pinterest account, then ticks the boards
 * its moodboard reads. Opened again from the "+", it shows the boards read now ticked, to add or
 * change them.
 */
function PinterestSetup({ onDone }: { onDone?: () => void }) {
  const { brand } = useBrand()
  const [setup, setSetup] = React.useState<PinterestSetup | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [picked, setPicked] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  // Bumped by "Check again", which reads the boards once more; `checking` until it answers.
  const [reads, setReads] = React.useState(0)
  const [checking, setChecking] = React.useState(false)
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    let live = true
    pinterestSetup(brand.id).then(
      (s) => {
        if (!live) return
        setChecking(false)
        setSetup(s)
        // The boards it reads now; else the likely one, the first with pins, so one click links it.
        const now = s.boards.filter((b) => b.picked).map((b) => b.id)
        const likely = s.boards.find((b) => b.pinCount > 0) ?? s.boards[0]
        setPicked(now.length > 0 ? now : likely ? [likely.id] : [])
      },
      (err: unknown) => {
        if (!live) return
        setChecking(false)
        // A dead sign-in: offer Connect again, with the reason.
        if (err instanceof RemoteError && err.code === 'PINTEREST_RECONNECT') {
          setSetup({ account: null, boards: [] })
        }
        setError(message(err))
      },
    )
    return () => {
      live = false
    }
  }, [brand.id, reads])

  async function run(act: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await act()
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  const button = (
    label: string,
    onClick: () => void,
    disabled = false,
    pending = 'Connecting…',
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="bb-press flex h-10 items-center justify-center gap-2 self-start rounded-full bg-ink px-5 text-[13.5px] font-medium text-page hover:opacity-85 disabled:opacity-40"
    >
      {busy && (
        <span className="size-3 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
      )}
      {busy ? pending : label}
    </button>
  )
  const problem = error && <p className="text-[12.5px] text-fail-ink">{error}</p>

  if (!setup) {
    return (
      <div className="flex flex-col gap-4 text-left">
        <span className={EYEBROW}>Pinterest</span>
        {problem ?? <p className="text-[13.5px] text-ink-4">Loading…</p>}
      </div>
    )
  }

  if (!setup.account) {
    return (
      <div className="flex flex-col gap-4 text-left">
        <span className={EYEBROW}>Pinterest</span>
        <p className="text-[13.5px] text-ink-2">Link {brand.name}’s Pinterest account.</p>
        {button('Connect Pinterest', () => void run(() => startPinterest(brand.id)))}
        {problem}
      </div>
    )
  }

  const handle = `Pinterest · @${setup.account.username}`
  // Pinterest signs in whoever is signed in on pinterest.com, so another account starts there.
  const another = (
    <button
      type="button"
      onClick={() => void run(() => startPinterest(brand.id))}
      className="self-start text-[12.5px] text-ink-4 underline-offset-2 hover:text-ink hover:underline"
    >
      Use another Pinterest account
    </button>
  )

  if (setup.boards.length === 0) {
    return (
      <div className="flex flex-col gap-4 text-left">
        <span className={EYEBROW}>{handle}</span>
        <p className="text-[13.5px] text-ink-2">
          No boards on this account yet. Make one on{' '}
          <a
            href="https://www.pinterest.com/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink underline underline-offset-2"
          >
            Pinterest
          </a>
          , then check again.
        </p>
        <button
          type="button"
          disabled={checking}
          onClick={() => {
            setError(null)
            setChecking(true)
            setReads((n) => n + 1)
          }}
          className="bb-press flex h-10 items-center self-start rounded-full bg-ink px-5 text-[13.5px] font-medium text-page hover:opacity-85 disabled:opacity-40"
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
        {another}
        {problem}
      </div>
    )
  }

  // The boards read now; the list saves in the account's order, so the chips keep that order.
  const reading = setup.boards.filter((b) => b.picked).map((b) => b.id)
  const chosen = setup.boards.filter((b) => picked.includes(b.id)).map((b) => b.id)
  const changed = chosen.join() !== reading.join()
  const full = chosen.length >= MAX_BOARDS
  // The boards read when the picker opened come first, so a row never jumps when it is ticked.
  const match = (b: PinterestSetup['boards'][number]) =>
    b.name.toLowerCase().includes(query.trim().toLowerCase())
  const groups = [
    { label: 'On the moodboard', boards: setup.boards.filter((b) => b.picked && match(b)) },
    { label: 'Other boards', boards: setup.boards.filter((b) => !b.picked && match(b)) },
  ].filter((g) => g.boards.length > 0)

  const row = (b: PinterestSetup['boards'][number]) => {
    const on = picked.includes(b.id)
    // The ↗ sits beside the row's checkbox, not in it: opening the board never ticks it.
    return (
      <div key={b.id} className="group flex items-center gap-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={on}
          disabled={!on && full}
          onClick={() => setPicked((p) => (on ? p.filter((id) => id !== b.id) : [...p, b.id]))}
          className="flex flex-1 items-center gap-3 py-2 text-left disabled:opacity-40"
        >
          <span className="relative size-7 shrink-0 overflow-hidden rounded-[8px] bg-tile">
            {b.cover && <Image src={b.cover} alt="" fill sizes="56px" className="object-cover" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-medium">{b.name}</span>
            <span className="text-[12px] text-ink-4">{b.pinCount} pins</span>
          </span>
          {on && <CheckIcon size={13} />}
        </button>
        <a
          href={b.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${b.name} on Pinterest`}
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-surface hover:text-ink ${NO_HOVER_SHOWN}`}
        >
          <ArrowUpRightIcon size={12} />
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 text-left">
      <span className={EYEBROW}>{handle}</span>
      {setup.boards.length > SEARCH_FROM && (
        <label className="relative flex h-9 items-center max-md:h-10">
          <span className="pointer-events-none absolute left-3 text-ink-4">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Escape clears a search first; empty, it closes the picker.
              if (e.key === 'Escape' && query !== '') {
                e.stopPropagation()
                setQuery('')
              }
            }}
            placeholder="Search boards"
            aria-label="Search boards"
            className="h-full w-full rounded-full bg-surface-2 pr-4 pl-9 text-[13px] outline-none placeholder:text-ink-5 focus:bg-surface [&::-webkit-search-cancel-button]:appearance-none max-md:text-[15px]"
          />
        </label>
      )}
      <div
        role="group"
        aria-label="Boards"
        className="-my-1 flex max-h-[264px] flex-col gap-3 overflow-y-auto"
      >
        {groups.length === 0 && (
          <p className="py-2 text-[13px] text-ink-4">No boards match “{query.trim()}”.</p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col">
            {/* Headings only when the boards split in two: one list needs no title. */}
            {reading.length > 0 && reading.length < setup.boards.length && (
              <span className="pb-0.5 text-[11.5px] text-ink-4">{g.label}</span>
            )}
            {g.boards.map(row)}
          </div>
        ))}
      </div>
      {button(
        reading.length > 0
          ? 'Save'
          : `Connect ${chosen.length > 1 ? `${chosen.length} boards` : `${brand.name}’s board`}`,
        () =>
          void run(async () => {
            await saveBoards(brand.id, chosen)
            setBusy(false)
            onDone?.()
          }),
        reading.length > 0 ? !changed : chosen.length === 0,
        reading.length > 0 ? 'Saving…' : 'Connecting…',
      )}
      {another}
      {problem}
    </div>
  )
}

const message = (err: unknown) => {
  const text = err instanceof Error && err.message ? err.message : 'That did not work'
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

/**
 * The fan above "Bring in your moodboard" when the brand has no board covers, as every brand on the
 * core has before it links a source: the same four photos for every brand, the ones the first demo
 * brand's fan shows. Unsplash photos (`public/demo/CREDITS.md`), not anyone's posts.
 */
const FAN = ['cv-p-1', 'cv-p-2', 'cv-p-4', 'cv-p-5'].map((id) => `/demo/pins/${id}.jpg`)

function ConnectSources() {
  const { brand } = useBrand()
  const covers = boardsOf(brand.id)
    .flatMap((b) => b.covers.slice(0, 2))
    .slice(0, 4)
  // The source whose setup is open: the one a sign-in came back for, until the person picks.
  const [picked, setOpen] = React.useState<MoodSource | null | undefined>(undefined)
  const asked = useSetupAsked()
  const open = picked === undefined ? asked : picked
  const setup = React.useRef<HTMLDivElement>(null)
  // Opened by a sign-in coming back: in view, since on a phone it sits below the fold.
  React.useEffect(() => {
    if (asked && picked === undefined) setup.current?.scrollIntoView({ block: 'center' })
  }, [asked, picked])

  return (
    <section
      aria-label="Connect your accounts"
      className="mx-auto flex max-w-[620px] flex-col items-center gap-6 py-16 text-center"
    >
      {/* Decoration only: four photos fanned out above the title. */}
      <span aria-hidden="true" className="flex -space-x-6 max-[360px]:-space-x-10">
        {(covers.length > 0 ? covers : FAN).map((src, i) => (
          <span
            key={src}
            className="relative block h-[132px] w-[100px] overflow-hidden rounded-[14px] bg-tile shadow-[0_0_0_3px_var(--page)]"
            style={{
              transform: `rotate(${[-8, -3, 3, 8][i]}deg) translateY(${[8, 0, 0, 8][i]}px)`,
            }}
          >
            <Image src={src} alt="" fill sizes="250px" className="object-cover" />
          </span>
        ))}
      </span>
      <span className="font-display text-[32px] leading-none">Bring in your moodboard</span>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {(Object.keys(SOURCE_NAME) as MoodSource[]).map((source) => {
          const on = open === source
          return (
            <button
              key={source}
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? null : source)}
              className={`bb-press flex h-11 min-w-[176px] items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium hover:opacity-85 ${on ? 'bg-ink text-page' : 'bg-surface text-ink'}`}
            >
              <PlatformLogo platform={SOURCE_LOGO[source]} size={14} />
              {SOURCE_NAME[source]}
            </button>
          )
        })}
      </div>
      {open && (
        <div
          key={open}
          ref={setup}
          className="bb-pop w-full max-w-[420px] rounded-[18px] bg-surface-2 p-5"
        >
          <SourceSetup source={open} />
        </div>
      )}
    </section>
  )
}

/**
 * Each pin goes to the shortest column, by its shape, so the columns end level. Real columns,
 * not CSS multi-column: Safari tears a pin apart across columns when anything in it animates
 * (the hover zoom, the ring, the entrance), so pins flickered and vanished on hover.
 */
function toColumns(pins: Reference[], count: number) {
  const columns: Array<Array<{ ref: Reference; i: number }>> = Array.from(
    { length: count },
    () => [],
  )
  const heights = Array<number>(count).fill(0)
  pins.forEach((ref, i) => {
    const shortest = heights.indexOf(Math.min(...heights))
    columns[shortest]!.push({ ref, i })
    // The photo's height over its width, plus about a quarter for the caption under it.
    heights[shortest]! += (ref.ratio ?? 1.25) + 0.25
  })
  return columns
}

/** Pins at their own shape in columns, the way Pinterest lays out a board. A tap picks one. */
function Masonry({
  pins,
  selected,
  onToggle,
}: {
  pins: Reference[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const { brand, weeks, byId } = useBrand()
  const { ideas } = useIdeas(brand.id)
  const box = React.useRef<HTMLDivElement>(null)
  const [count, setCount] = React.useState(5)

  // As many columns as the width holds, the way the CSS breakpoints did.
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const w = entry!.contentRect.width
      setCount(w >= 1180 ? 5 : w >= 900 ? 4 : w >= 600 ? 3 : 2)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /** "In plan · 23 Oct" for a post an idea already grew from, or "In plan" while it has no day. */
  function usedOn(ref: Reference): string | null {
    const card = ideas.find((i) => i.inspiration.includes(ref.id) && i.status !== 'suggested')
    if (!card) return null
    const n = card.postId
      ? dayOf(weeks, card.postId)
      : dayOfHook(weeks, card.hook, (id) => byId(id)?.hook)
    const label = n ? dayLabel(n) : null
    return label ? `In plan · ${label.slice(4)}` : 'In plan'
  }

  return (
    <div ref={box} className="flex items-start gap-4 max-sm:gap-3">
      {toColumns(pins, count).map((column, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-6">
          {column.map(({ ref, i }) => {
            const order = selected.indexOf(ref.id)
            const on = order >= 0
            const used = usedOn(ref)
            return (
              <div
                key={ref.id}
                className="bb-deal flex flex-col gap-2"
                style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onToggle(ref.id)}
                  aria-label={`${ref.account}: ${ref.borrow}${on ? ` (picked ${order + 1})` : ''}`}
                  className={`group/pin relative block w-full overflow-hidden rounded-[16px] bg-tile text-left transition-shadow duration-200 ${on ? 'shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]' : ''}`}
                  style={{ aspectRatio: `1 / ${ref.ratio ?? 1.25}` }}
                >
                  {ref.image && (
                    <Image
                      src={ref.image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, 280px"
                      className={`object-cover transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${on ? 'scale-[1.03]' : 'group-hover/pin:scale-[1.03]'}`}
                    />
                  )}
                  {/* The pick mark: a number once picked, an empty ring on hover or while picking. */}
                  <span
                    aria-hidden="true"
                    className={`absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full font-mono text-[11px] transition-[opacity,background-color] duration-200 ${on ? 'bg-ink text-page shadow-[0_0_0_1.5px_var(--page)]' : `bg-white/70 shadow-[inset_0_0_0_1.5px_rgba(18,18,18,0.35)] backdrop-blur-md group-hover/pin:opacity-100 ${selected.length > 0 ? 'opacity-100' : 'opacity-0'}`}`}
                  >
                    {on ? order + 1 : ''}
                  </span>
                </button>
                <span className="flex flex-col gap-1.5 px-1">
                  <span className="text-[13px] leading-[1.3] text-ink">{ref.borrow}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      title={PLATFORM_NAME[ref.platform]}
                      className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface"
                    >
                      <PlatformLogo platform={ref.platform} size={12} brand />
                    </span>
                    <span className="truncate text-[12px] text-ink-2">{ref.account}</span>
                    {used && (
                      <span className="ml-auto shrink-0 text-[11.5px] text-ink-4">{used}</span>
                    )}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PasteLink({ onPaste }: { onPaste: (r: Reference) => void }) {
  const { brand } = useBrand()
  const [link, setLink] = React.useState('')

  function paste() {
    const raw = link.trim()
    if (!raw) return
    let host = raw
    try {
      host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./, '')
    } catch {
      /* keep the text as typed */
    }
    onPaste({
      id: `pasted-${newId()}`,
      platform: host.includes('tiktok') ? 'tt' : 'ig',
      account: host,
      image: '',
      borrow: 'Say what to borrow.',
      seed: {
        format: 'reel',
        pillar: 'Craft',
        hook: 'New idea from a reference.',
        angle: 'What to borrow, in your words.',
        feature: brand.name,
        shots: [],
        sharper: [],
      },
    })
    setLink('')
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        paste()
      }}
      className="max-w-[420px]"
    >
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        maxLength={500}
        placeholder="Paste an Instagram or TikTok link"
        aria-label="Paste an Instagram or TikTok link"
        className="h-10 w-full rounded-full bg-surface px-4 text-[13px] outline-none placeholder:text-ink-5 focus:bg-paper"
      />
    </form>
  )
}
