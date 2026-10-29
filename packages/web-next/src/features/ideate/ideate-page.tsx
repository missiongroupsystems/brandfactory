'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { flushSync } from 'react-dom'

import { AppHeader } from '@/components/app-header'
import { LoadingDots } from '@/components/loading-dots'
import { TITLE } from '@/components/page-title'
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
import { Sheet } from '@/components/sheet'
import { usePhone } from '@/components/use-phone'
import type { BrandId } from '@/data/brands'
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
  keepPasted,
  pastedKept,
  pinsLoading,
  removeBoard,
  saveBoards,
  pasteLink,
  skipSuggestion,
  suggest,
  useIdeas,
  wordsOnPasted,
  type MoodSource,
} from './ideas-store'
import { IDEAS_HREF } from './idea-page'
import {
  knownSetup,
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
        <h1 className={TITLE}>Ideas</h1>
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
            className="flex h-8 items-center rounded-full bg-page px-3 text-[13px] text-ink hover:opacity-85"
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
                  title={`${own} of ${target} feed posts this month have an idea. This drafts ${open} more from what worked; you keep or skip each.`}
                  className="flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-(--insight-6) transition-colors hover:bg-(--insight-wash)"
                >
                  <SparkIcon size={10} />
                  Suggest {open === 1 ? 'one' : open} for this month
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
          <h2 className="flex h-9 items-center text-[16px] font-medium tracking-[-0.01em]">
            Moments ahead
          </h2>
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
            <span className="truncate text-[13px]" style={{ color: source.colour }}>
              {source.text}
            </span>
          )}
        </span>
      </Link>
      {/* Every card ends in the same line: where it stands at the left, its format at the right.
          Only what differs is said: the day, and the stage once it is past an idea. An idea with
          no day has the one action in that place: Plan it. A suggestion opens on its page to keep,
          and Skip dismisses it here. */}
      <span className="flex min-h-5 items-center gap-2 px-0.5 text-[13px] text-ink-4">
        {suggested ? (
          // Dismissed from the board as before; keeping it is the idea page's job.
          <>
            <span className="truncate text-(--insight-6)">
              {['Suggested', label].filter(Boolean).join(' · ')}
            </span>
            <button
              type="button"
              onClick={() => skipSuggestion(brand.id, card.id)}
              className={`${ACT} relative z-[1] text-ink-4 hover:text-ink`}
            >
              Skip
            </button>
          </>
        ) : placed ? (
          <span className="flex min-w-0 items-center gap-2">
            {status !== 'idea' && (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: statusColour(status) }}
              />
            )}
            <span className="truncate">
              {[status === 'idea' ? '' : STATUS_LABEL[status], label].filter(Boolean).join(' · ')}
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onPlan}
            className={`${ACT} relative z-[1] text-ink hover:opacity-70`}
          >
            Plan it
          </button>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <FormatIcon format={card.format} size={10} />
          {FORMAT_LABEL[card.format]}
        </span>
      </span>
    </article>
  )
}

/** Where the idea came from, in one quiet line, when the photos alone do not say it. */
function sourceOf(card: IdeaCard): { text: string; colour: string } | null {
  const s = card.source
  // An insight's statistic is for the idea's page: on a card it only made the rows uneven.
  if (s.kind === 'insight') return null
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
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[13px] font-medium text-white">
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

/** A moment nearby, pitched like an idea: plan it and it lands on the calendar's next open day. */
function MomentView({ moment, onUse }: { moment: Moment; onUse: () => void }) {
  const [, day, month] = moment.when.split(' ')
  return (
    <article className="flex flex-col gap-3">
      <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-[14px] bg-(--layer-holiday) text-(--layer-holiday-ink)">
        <span className="font-display text-[56px] leading-none tracking-[-0.04em] max-md:text-[44px]">
          {day}
        </span>
        <span className="text-[13px] font-medium">
          {month && month.charAt(0) + month.slice(1).toLowerCase()}
        </span>
      </span>
      <span className="flex flex-col gap-1.5 px-0.5">
        <span className={HOOK}>{moment.seed.hook}</span>
        <span className="truncate text-[13px] text-(--layer-holiday-ink)">
          {moment.title} · {moment.near}
        </span>
      </span>
      <span className="flex min-h-5 items-center gap-2 px-0.5 text-[13px] text-ink-4">
        <button type="button" onClick={onUse} className={`${ACT} text-ink hover:opacity-70`}>
          Plan it
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <FormatIcon format={moment.seed.format} size={10} />
          {FORMAT_LABEL[moment.seed.format]}
        </span>
      </span>
    </article>
  )
}

// ── Moodboard ────────────────────────────────────────────────────────────────────────────────

const SOURCE_NAME: Record<MoodSource, string> = {
  pinterest: 'Pinterest',
  dm: 'Instagram',
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
 * A live Pinterest board's chip. On hover or focus (on a touch screen, on the chosen chip only) the
 * chip widens to show a small × that removes the board at once: the "+" picker adds it back in two
 * clicks.
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
  // Closed, the × takes no room, so the chip's label sits centred like every other chip.
  const open =
    'group-hover:-ml-2.5 group-hover:grid-cols-[1fr] group-hover:opacity-100 group-focus-within:-ml-2.5 group-focus-within:grid-cols-[1fr] group-focus-within:opacity-100'
  const touch = on
    ? '[@media(hover:none)]:-ml-2.5 [@media(hover:none)]:grid-cols-[1fr] [@media(hover:none)]:opacity-100'
    : '[@media(hover:none)]:pointer-events-none'

  return (
    <span
      className={`group flex h-9 shrink-0 items-center rounded-full transition-colors ${on ? CHIP_ON : CHIP_OFF} ${busy ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={onSelect}
        className="flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium"
      >
        <PlatformLogo platform="pinterest" size={11} />
        {label}
      </button>
      <span
        className={`grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity,margin] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${open} ${touch}`}
      >
        {/* min-w-0: unlike overflow-hidden, overflow-clip alone keeps the 0fr column at the ×'s width. */}
        <span className="min-w-0 overflow-clip">
          <button
            type="button"
            aria-label={`Remove ${label}`}
            disabled={busy}
            onClick={onRemove}
            className="mr-1.5 flex size-6 items-center justify-center rounded-full hover:bg-current/10"
          >
            <CloseIcon size={8} />
          </button>
        </span>
      </span>
    </span>
  )
}

/**
 * Shows a change of the moodboard's boards in a view transition, as the brand switch does: new
 * pins grow in, leaving ones shrink away and the rest glide into place (CSS in tokens.css, which
 * names the pins only while `data-moving-boards` is on, so a brand switch keeps its cross-fade).
 * Where the browser has no view transitions, the change shows at once.
 */
function moveBoards(change: () => void) {
  if (!('startViewTransition' in document)) return change()
  const root = document.documentElement
  const move = ++moves
  root.dataset.movingBoards = ''
  const transition = document.startViewTransition(() => flushSync(change))
  // A move started meanwhile skips this one, whose `ready` then rejects; the last clears the flag.
  transition.ready.catch(() => undefined)
  const done = () => {
    if (move === moves) delete root.dataset.movingBoards
  }
  transition.finished.then(done, done)
}
let moves = 0

/** Reads the board picker's setup ahead, unless one is known; the picker reports a failure. */
function prefetchSetup(brandId: BrandId) {
  if (knownSetup(brandId) || prefetched.has(brandId)) return
  prefetched.add(brandId)
  pinterestSetup(brandId).catch(() => undefined)
}
/** Read ahead once per page load: a failing account is not read again on every hover. */
const prefetched = new Set<BrandId>()

/**
 * The setup read last, ticked by the boards the moodboard shows now, so a board removed by its
 * chip's × since then is not ticked; null when none was read yet.
 */
function openingSetup(brandId: BrandId): PinterestSetup | null {
  const known = knownSetup(brandId)
  if (!known) return null
  const live = boardsOf(brandId).map(pinterestIdOf)
  return { ...known, boards: known.boards.map((b) => ({ ...b, picked: live.includes(b.id) })) }
}

/** Posts DM'd to the moodboard account carry Instagram's logo. */
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
  // A tap opens a pin; Select (or a long press) makes taps pick instead, for an idea from several.
  const [selecting, setSelecting] = React.useState(false)
  // The pin open in the preview, by id, and the link whose words are being typed.
  const [opened, setOpened] = React.useState<string | null>(null)
  const [fresh, setFresh] = React.useState<string | null>(null)

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
    // Pasted links live here too, with or without the DM source; a TikTok among them widens the name.
    ...(sources.dm || pasted.length > 0
      ? [
          {
            id: 'dm',
            label: pasted.some((r) => r.platform === 'tt') ? 'Links' : 'Instagram',
            source: 'dm' as const,
            pins: [...pasted, ...(sources.dm ? references.filter((r) => r.platform === 'ig') : [])],
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
  // A pasted link leads the board: it is what the person just did, so it shows first.
  const all = [
    ...pasted,
    ...Array.from({ length: longest }, (_, i) => folders.flatMap((f) => f.pins[i] ?? [])).flat(),
  ].filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i)
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
    setSelecting(false)
  }

  /** The picked posts become an idea at once, worded from the first; its page does the rest. */
  function plan(from = picked) {
    // A pasted link the idea names must be on the server: a paste whose send failed goes again.
    for (const r of from) if (isPasted(r)) keepPasted(brand.id, r.id)
    const id = addIdeaFromPosts(brand.id, from)
    clear()
    setOpened(null)
    onPlanned(id)
  }

  /** Where a popover opens: under the chip `el`, kept on screen near the right edge. */
  function anchorAt(el: HTMLElement, width: number) {
    const row = top.current?.getBoundingClientRect()
    const chip = el.getBoundingClientRect()
    if (row) setAnchor(Math.max(0, Math.min(chip.left - row.left, row.width - width - 40)))
  }

  /**
   * Takes a board off the moodboard at once, its pins shrinking away (`moveBoards`); the last one
   * turns Pinterest off. The account stays.
   */
  async function remove(id: string) {
    if (removing) return
    setRemoving(true)
    try {
      await removeBoard(brand.id, id, (apply) =>
        moveBoards(() => {
          if (filter === id) setFilter('all')
          apply()
        }),
      )
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
        <div className="flex flex-col gap-2">
          <div className="relative flex items-center gap-1.5">
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
            <PasteLink
              onPaste={(r) => {
                pasteLink(brand.id, r)
                setFilter('all')
                setFresh(r.id)
              }}
            />
            {choices.length > 0 && (
              <button
                type="button"
                aria-label={livePinterest ? 'Pinterest boards' : 'Add a source'}
                aria-expanded={adding}
                // The boards start loading on the way to a click, once per page load.
                onPointerEnter={() => livePinterest && prefetchSetup(brand.id)}
                onFocus={() => livePinterest && prefetchSetup(brand.id)}
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
            {shown.length > 0 && !selecting && (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface hover:text-ink"
              >
                Select
              </button>
            )}
          </div>
          {selecting && (
            <div role="region" aria-label="Selection" className="flex h-9 items-center gap-3">
              <button
                type="button"
                aria-label="Cancel the selection"
                onClick={clear}
                className="-ml-2 flex size-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
              >
                <CloseIcon />
              </button>
              <span className="text-[13px] font-medium tabular-nums">
                {picked.length ? `${picked.length} selected` : 'Tap the posts to plan from'}
              </span>
              <button
                type="button"
                onClick={() => plan()}
                disabled={picked.length === 0}
                className="bb-press ml-auto flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-30"
              >
                Plan idea
              </button>
            </div>
          )}
        </div>
        {adding && choices.length > 0 && (
          <div
            style={{ '--x': `${anchor}px` } as React.CSSProperties}
            className="bb-pop absolute top-full left-(--x) mt-1 w-[360px] rounded-[18px] bg-page p-5 shadow-[0_0_0_1px_var(--line),0_16px_40px_-16px_rgba(0,0,0,0.22)] max-md:right-4 max-md:left-4 max-md:w-auto"
          >
            <AddSource missing={choices} initial={asked} onDone={() => setAdding(false)} />
          </div>
        )}
      </div>
      {shown.length === 0 &&
      (!current || current.source === 'pinterest') &&
      pinsLoading(brand.id) ? (
        // Pinterest's pins take a few seconds.
        <LoadingDots label="Loading the moodboard" className="py-24" />
      ) : (
        <Masonry
          key={filter}
          pins={shown}
          selected={selecting ? selected : null}
          fresh={fresh}
          onToggle={toggle}
          onOpen={(id) => setOpened(id)}
          onHold={(id) => {
            setSelecting(true)
            setSelected((s) => (s.includes(id) ? s : [...s, id]))
          }}
          onWords={(id, borrow) => {
            wordsOnPasted(brand.id, id, borrow)
            if (fresh === id) setFresh(null)
          }}
        />
      )}
      {opened && (
        <Preview
          pins={shown}
          id={opened}
          // A pin's own link, or its board's.
          urlOf={(r) => r.url ?? folders.find((f) => f.pins.some((p) => p.id === r.id))?.url}
          onMove={setOpened}
          onClose={() => setOpened(null)}
          onPlan={(r) => plan([r])}
        />
      )}
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
          className="flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] font-medium transition-colors hover:bg-surface"
        >
          <PlatformLogo platform={SOURCE_LOGO[m]} size={13} />
          {SOURCE_NAME[m]}
        </button>
      ))}
    </div>
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
  const { brand } = useBrand()
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
        className="bb-press flex h-10 items-center justify-center gap-2 self-start rounded-full bg-ink px-5 text-[14px] font-medium text-page hover:opacity-85"
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
        <p className="text-[14px] text-ink-2">
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
        <ol className="flex flex-col gap-2 text-[14px] text-ink-2">
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
      {/* Only this brand's board: the others on the team's account are noise here. */}
      <div role="radiogroup" aria-label="Boards" className="flex flex-col">
        <span
          role="radio"
          aria-checked
          aria-label={`${brand.name} board`}
          className="flex items-center gap-3 py-2.5"
        >
          <span className="relative size-7 shrink-0 overflow-hidden rounded-full">
            <BrandLogo brandId={brand.id} sizes="56px" />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-[14px] font-medium">{brand.name}</span>
            <span className="text-[13px] text-ink-4">
              {boardsOf(brand.id).reduce((n, s) => n + s.pinCount, 0)} pins
            </span>
          </span>
          <CheckIcon size={13} />
        </span>
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
  // The setup read last opens at once; the read below refreshes it.
  const [setup, setSetup] = React.useState<PinterestSetup | null>(() => openingSetup(brand.id))
  const [error, setError] = React.useState<string | null>(null)
  const [picked, setPicked] = React.useState<string[]>(
    () =>
      openingSetup(brand.id)
        ?.boards.filter((b) => b.picked)
        .map((b) => b.id) ?? [],
  )
  // Once the person ticks a board, the read below keeps their ticks; until then it sets them.
  const touched = React.useRef(false)
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
        if (touched.current) {
          setPicked((p) => p.filter((id) => s.boards.some((b) => b.id === id)))
          return
        }
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
      className="bb-press flex h-10 items-center justify-center gap-2 self-start rounded-full bg-ink px-5 text-[14px] font-medium text-page hover:opacity-85 disabled:opacity-40"
    >
      {busy && (
        <span className="size-3 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
      )}
      {busy ? pending : label}
    </button>
  )
  const problem = error && <p className="text-[13px] text-fail-ink">{error}</p>

  if (!setup) {
    return (
      <div className="flex flex-col gap-4 text-left">
        <span className={EYEBROW}>Pinterest</span>
        {problem ?? (
          // Rows the shape of the boards, so the card keeps its size when they come.
          <div aria-label="Loading boards" className="flex flex-col">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bb-pulse flex items-center gap-3 py-2"
                style={{ animationDelay: `${i * 160}ms` }}
              >
                <span className="size-7 shrink-0 rounded-[8px] bg-tile" />
                <span className="flex flex-col gap-1.5">
                  <span className="h-2.5 w-28 rounded-full bg-tile" />
                  <span className="h-2 w-14 rounded-full bg-tile" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!setup.account) {
    return (
      <div className="flex flex-col gap-4 text-left">
        <span className={EYEBROW}>Pinterest</span>
        <p className="text-[14px] text-ink-2">Link {brand.name}’s Pinterest account.</p>
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
      className="self-start text-[13px] text-ink-4 underline-offset-2 hover:text-ink hover:underline"
    >
      Use another Pinterest account
    </button>
  )

  if (setup.boards.length === 0) {
    return (
      <div className="flex flex-col gap-4 text-left">
        <span className={EYEBROW}>{handle}</span>
        <p className="text-[14px] text-ink-2">
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
          className="bb-press flex h-10 items-center self-start rounded-full bg-ink px-5 text-[14px] font-medium text-page hover:opacity-85 disabled:opacity-40"
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
          onClick={() => {
            touched.current = true
            setPicked((p) => (on ? p.filter((id) => id !== b.id) : [...p, b.id]))
          }}
          className="flex flex-1 items-center gap-3 py-2 text-left disabled:opacity-40"
        >
          <span className="relative size-7 shrink-0 overflow-hidden rounded-[8px] bg-tile">
            {b.cover && <Image src={b.cover} alt="" fill sizes="56px" className="object-cover" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-medium">{b.name}</span>
            <span className="text-[13px] text-ink-4">{b.pinCount} pins</span>
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
            className="h-full w-full rounded-full bg-surface-2 pr-4 pl-9 text-[13px] outline-none placeholder:text-ink-5 focus:bg-surface [&::-webkit-search-cancel-button]:appearance-none max-md:text-[16px]"
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
              <span className="pb-0.5 text-[13px] text-ink-4">{g.label}</span>
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
            await saveBoards(brand.id, chosen, moveBoards)
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
    if (asked && picked === undefined) setup.current?.scrollIntoView({ block: 'nearest' })
  }, [asked, picked])
  // Opened by a tap: the panel lands below the fold on a short screen, so bring it into view.
  React.useEffect(() => {
    if (picked) setup.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [picked])

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
          // On a phone the tab bar covers the foot of the window: the panel stops above it.
          className="bb-pop w-full max-w-[420px] scroll-mb-6 rounded-[18px] bg-surface-2 p-5 max-md:scroll-mb-[calc(88px+env(safe-area-inset-bottom))]"
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

/** A link pasted onto the board, whose words the team types in place. */
const isPasted = (ref: Reference) => ref.id.startsWith('pasted-')

/** How long a finger rests on a pin before taps start picking, in milliseconds. */
const HOLD_MS = 500

/**
 * Pins at their own shape in columns, the way Pinterest lays out a board. A tap opens one;
 * while selecting (`selected` is a list), a tap picks one instead. A finger held on a pin starts
 * selecting with it.
 */
function Masonry({
  pins,
  selected,
  fresh,
  onToggle,
  onOpen,
  onHold,
  onWords,
}: {
  pins: Reference[]
  /** The pins picked, in order, while selecting; null while a tap opens a pin. */
  selected: string[] | null
  /** The link just pasted: its words field takes the cursor. */
  fresh: string | null
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onHold: (id: string) => void
  /** The words typed on a pasted link. */
  onWords: (id: string, borrow: string) => void
}) {
  const { brand, weeks, byId } = useBrand()
  const { ideas } = useIdeas(brand.id)
  const box = React.useRef<HTMLDivElement>(null)
  const [count, setCount] = React.useState(5)
  const selecting = selected !== null
  // The press in progress: its timer, where it began, and whether it became a hold, so the tap
  // after a hold does nothing.
  const hold = React.useRef<{ timer: number; held: boolean; x: number; y: number } | null>(null)

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

  /** The finger lifted or left: no hold comes of it now; a hold already made still eats the tap. */
  const endHold = () => {
    if (!hold.current) return
    window.clearTimeout(hold.current.timer)
    if (!hold.current.held) hold.current = null
  }

  return (
    <div ref={box} className="flex items-start gap-4 max-sm:gap-3">
      {toColumns(pins, count).map((column, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-6">
          {column.map(({ ref, i }) => {
            const order = selected?.indexOf(ref.id) ?? -1
            const on = order >= 0
            const used = usedOn(ref)
            const pasted = isPasted(ref)
            return (
              <div
                key={ref.id}
                className="bb-deal bb-pin flex flex-col gap-2"
                style={
                  {
                    animationDelay: `${Math.min(i, 12) * 45}ms`,
                    // The pin's name in `moveBoards`' view transition (tokens.css).
                    '--pin': `pin-${ref.id.replace(/[^\w-]/g, '_')}`,
                  } as React.CSSProperties
                }
              >
                <button
                  type="button"
                  data-pin={ref.id}
                  role={selecting ? 'checkbox' : undefined}
                  aria-checked={selecting ? on : undefined}
                  onPointerDown={(e) => {
                    if (e.pointerType !== 'touch' || selecting) return
                    hold.current = null
                    const press = { held: false, timer: 0, x: e.clientX, y: e.clientY }
                    press.timer = window.setTimeout(() => {
                      press.held = true
                      onHold(ref.id)
                    }, HOLD_MS)
                    hold.current = press
                  }}
                  onPointerMove={(e) => {
                    // A finger that drifts a little is still a press; a scroll is not.
                    const p = hold.current
                    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) endHold()
                  }}
                  onPointerUp={endHold}
                  onPointerCancel={() => {
                    if (hold.current) window.clearTimeout(hold.current.timer)
                    hold.current = null
                  }}
                  onContextMenu={(e) => hold.current?.held && e.preventDefault()}
                  onClick={() => {
                    const held = hold.current?.held
                    hold.current = null
                    if (held) return
                    if (selecting) onToggle(ref.id)
                    else onOpen(ref.id)
                  }}
                  aria-label={`${ref.account}: ${ref.borrow || 'pasted link'}${on ? ` (picked ${order + 1})` : ''}`}
                  className={`group/pin relative block w-full overflow-hidden rounded-[16px] bg-tile text-left transition-shadow duration-200 ${on ? 'shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]' : ''}`}
                  style={{ aspectRatio: `1 / ${ref.ratio ?? (ref.image ? 1.25 : 0.72)}` }}
                >
                  {ref.image ? (
                    <Image
                      src={ref.image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, 280px"
                      className={`object-cover transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${on ? 'scale-[1.03]' : 'group-hover/pin:scale-[1.03]'}`}
                    />
                  ) : (
                    // A link with no picture yet: the platform's mark stands in.
                    <span className="absolute inset-0 flex items-center justify-center text-ink-4">
                      <PlatformLogo platform={ref.platform} size={24} />
                    </span>
                  )}
                  {/* The pick mark, while selecting: a number once picked, an empty ring until then. */}
                  {selecting && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full font-mono text-[12px] transition-[opacity,background-color] duration-200 ${on ? 'bg-ink text-page shadow-[0_0_0_1.5px_var(--page)]' : 'bg-white/70 shadow-[inset_0_0_0_1.5px_rgba(18,18,18,0.35)] backdrop-blur-md'}`}
                    >
                      {on ? order + 1 : ''}
                    </span>
                  )}
                </button>
                <span className="flex flex-col gap-1.5 px-1">
                  {pasted ? (
                    <Words
                      id={ref.id}
                      value={ref.borrow}
                      focus={fresh === ref.id}
                      // The core keeps a link as first sent, without words: none can be added there.
                      locked={remote && pastedKept(ref.id)}
                      onDone={(words) => onWords(ref.id, words)}
                    />
                  ) : (
                    <span className="text-[13px] leading-[1.3] text-ink">{ref.borrow}</span>
                  )}
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      title={PLATFORM_NAME[ref.platform]}
                      className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface"
                    >
                      <PlatformLogo platform={ref.platform} size={12} brand />
                    </span>
                    <span className="truncate text-[13px] text-ink-2">{ref.account}</span>
                    {used && (
                      <span className="ml-auto shrink-0 text-[12px] text-ink-4">{used}</span>
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

/** What to borrow from a pasted link, typed in place: Enter or leaving the field keeps it. */
function Words({
  id,
  value,
  focus,
  locked,
  onDone,
}: {
  id: string
  value: string
  focus: boolean
  /** The words cannot be kept: the card says so and takes none. */
  locked: boolean
  onDone: (words: string) => void
}) {
  const field = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (focus && !locked) field.current?.focus()
  }, [focus, locked])
  if (locked) {
    return (
      <span className="text-[13px] leading-[1.3] text-ink-4">
        {value || 'Say what to borrow on the idea.'}
      </span>
    )
  }
  return (
    <input
      key={id}
      ref={field}
      defaultValue={value}
      placeholder="What to borrow?"
      aria-label="What to borrow"
      maxLength={120}
      onBlur={(e) => e.target.value.trim() !== value && onDone(e.target.value.trim())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="h-7 w-full min-w-0 rounded-[8px] bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4 focus:bg-surface focus:px-1.5"
    />
  )
}

/**
 * One pin, bigger: its picture, its words and whose it is, a link to it on its platform, and
 * the one thing to do with it. A centred dialog on a computer, a sheet on a phone. The arrow keys
 * (or a swipe) move to the next pin; Escape or a tap outside closes it, and the focus goes back
 * to the pin.
 */
function Preview({
  pins,
  id,
  urlOf,
  onMove,
  onClose,
  onPlan,
}: {
  pins: Reference[]
  id: string
  urlOf: (ref: Reference) => string | undefined
  onMove: (id: string) => void
  onClose: () => void
  onPlan: (ref: Reference) => void
}) {
  const phone = usePhone()
  const at = pins.findIndex((p) => p.id === id)
  const ref = pins[at]
  const main = React.useRef<HTMLButtonElement>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const touch = React.useRef<{ x: number; y: number } | null>(null)
  const move = React.useCallback(
    (by: -1 | 1) => {
      const next = pins[at + by]
      if (next) onMove(next.id)
    },
    [pins, at, onMove],
  )

  // The focus goes to the one button, and back to the pin on show on close: the one open then,
  // since the arrow keys may have moved on from the pin that was tapped.
  const current = React.useRef(id)
  React.useEffect(() => {
    current.current = id
  }, [id])
  React.useEffect(() => {
    if (!phone) main.current?.focus()
    return () => {
      const pin = document.querySelector<HTMLElement>(
        `[data-pin="${current.current.replace(/"/g, '')}"]`,
      )
      pin?.focus()
    }
  }, [phone])

  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key === 'Tab' && box.current) return trap(e, box.current)
      // A plain arrow walks the row; one with a modifier, or inside a field, is the browser's.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return
      if (e.key === 'ArrowLeft') move(-1)
      if (e.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [move, onClose])

  if (!ref) return null
  const url = urlOf(ref)
  const body = (
    <div
      className={`flex flex-col gap-4 ${phone ? 'px-5 pb-5' : ''}`}
      onTouchStart={(e) => {
        const t = e.touches[0]
        touch.current = t ? { x: t.clientX, y: t.clientY } : null
      }}
      onTouchEnd={(e) => {
        // A swipe is sideways: a scroll that drifts a little is not one.
        const from = touch.current
        const t = e.changedTouches[0]
        touch.current = null
        if (!from || !t) return
        const dx = t.clientX - from.x
        const dy = t.clientY - from.y
        if (Math.abs(dx) < 40 || Math.abs(dx) <= 2 * Math.abs(dy)) return
        move(dx < 0 ? 1 : -1)
      }}
    >
      <span
        key={ref.id}
        className="bb-land relative block w-full overflow-hidden rounded-[14px] bg-tile"
        style={{
          aspectRatio: `1 / ${ref.ratio ?? (ref.image ? 1.25 : 0.72)}`,
          maxHeight: phone ? '58svh' : '70vh',
        }}
      >
        {ref.image ? (
          <Image src={ref.image} alt="" fill sizes="520px" className="object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-ink-4">
            <PlatformLogo platform={ref.platform} size={32} />
          </span>
        )}
      </span>
      <div className="flex flex-col gap-1">
        {ref.borrow && <span className="text-[16px] leading-[1.35] text-ink">{ref.borrow}</span>}
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-3">
          <PlatformLogo platform={ref.platform} size={11} brand />
          <span className="truncate">{ref.account}</span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex shrink-0 items-center gap-1 text-ink-3 transition-colors hover:text-ink"
            >
              Open on {PLATFORM_NAME[ref.platform]}
              <ArrowUpRightIcon size={10} />
            </a>
          )}
        </span>
      </div>
      <button
        ref={main}
        type="button"
        onClick={() => onPlan(ref)}
        className="bb-press flex h-10 items-center justify-center rounded-full bg-ink px-5 text-[14px] font-medium text-page hover:opacity-85"
      >
        Plan idea from this
      </button>
    </div>
  )
  if (phone) {
    return (
      <Sheet title={ref.account} onClose={onClose}>
        {body}
      </Sheet>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bb-fade absolute inset-0 bg-ink/30"
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={ref.account}
        className="bb-pop relative flex max-h-[calc(100vh-48px)] w-[440px] flex-col overflow-y-auto rounded-[22px] bg-page p-4 shadow-sheet"
      >
        {body}
        {/* Where the pin stands in the row, and the way to the ones beside it. */}
        <span className="pointer-events-none absolute top-6 right-6 rounded-full bg-page/85 px-2 py-0.5 text-[12px] text-ink-3 tabular-nums backdrop-blur-sm">
          {at + 1} / {pins.length}
        </span>
      </div>
    </div>
  )
}

/** Tab stays inside the preview: from its last control it goes to the first, and back. */
function trap(e: KeyboardEvent, box: HTMLElement) {
  const nodes = [...box.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex="0"]')]
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (!first || !last) return
  const at = document.activeElement
  if (e.shiftKey && (at === first || !box.contains(at))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (at === last || !box.contains(at))) {
    e.preventDefault()
    first.focus()
  }
}

/**
 * A link into the chip row: paste it and it lands first on the board. On a phone the row has no
 * room for a field beside the chips, so a small link mark opens one in their place.
 */
function PasteLink({ onPaste }: { onPaste: (r: Reference) => void }) {
  const { brand } = useBrand()
  const phone = usePhone()
  const [link, setLink] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const field = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (open) field.current?.focus()
  }, [open])

  function paste(raw = link.trim()) {
    if (!raw) return
    const url = raw.includes('://') ? raw : `https://${raw}`
    const host = hostOf(url)
    // Not a link: it stays in the field, so a slip can be fixed, and no pin lands.
    if (!host) return setLink(raw)
    onPaste({
      id: `pasted-${newId()}`,
      platform: host.includes('tiktok') ? 'tt' : 'ig',
      account: host,
      image: '',
      borrow: '',
      url,
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
    setOpen(false)
  }

  if (phone && !open) {
    return (
      <button
        type="button"
        aria-label="Paste a link"
        title="Paste a link"
        onClick={() => setOpen(true)}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 shadow-[inset_0_0_0_1px_var(--cal-ghost)] transition-colors hover:text-ink"
      >
        <LinkGlyph />
      </button>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        paste()
      }}
      // Open on a phone, the field lies over the chips, the width of the row.
      className={`flex shrink-0 ${phone ? 'absolute inset-x-0 top-0 z-[1] h-9 items-center bg-page' : ''}`}
    >
      <input
        ref={field}
        value={link}
        onBlur={(e) => {
          // Focus moving inside the form (Tab to the ×) keeps the field open.
          if (e.currentTarget.form?.contains(e.relatedTarget as Node | null)) return
          if (link.trim() === '') setOpen(false)
        }}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        onChange={(e) => setLink(e.target.value)}
        onPaste={(e) => {
          // A paste is the whole gesture: the link lands without an Enter.
          const text = e.clipboardData.getData('text').trim()
          if (!text) return
          e.preventDefault()
          paste(text)
        }}
        maxLength={500}
        placeholder="Paste a link"
        aria-label="Paste an Instagram or TikTok link"
        className={`h-9 rounded-full bg-surface px-3.5 text-[13px] outline-none placeholder:text-ink-4 focus:bg-paper focus:shadow-[0_0_0_1.5px_var(--ink)] ${phone ? 'w-full min-w-0 text-[16px]' : 'w-[180px]'}`}
      />
      {/* Over the chips on a phone, the field has its own way out: the chips and Select return. */}
      {phone && (
        <button
          type="button"
          aria-label="Cancel the link"
          // Before the field's blur, which would close it first and swallow the tap.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            setLink('')
            setOpen(false)
          }}
          className="ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
        >
          <CloseIcon />
        </button>
      )}
    </form>
  )
}

/** The site a link points at ("instagram.com"), or null when the text is not a web address. */
function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const host = u.hostname.replace(/^www\./, '')
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}

function LinkGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M5 7a2.1 2.1 0 0 0 3 0l1.8-1.8a2.1 2.1 0 0 0-3-3L6.3 2.7M7 5a2.1 2.1 0 0 0-3 0L2.2 6.8a2.1 2.1 0 0 0 3 3l.5-.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
