'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Segmented } from '@/components/controls'
import { CheckIcon, CloseIcon, PlusIcon, SparkIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import { MOODBOARD_ACCOUNT, moodboardTag, PINTEREST_ACCOUNT } from '@/data/brand-kit'
import {
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
import { demoOf, newId } from '@/lib/remote'

import { EYEBROW, FormatIcon, STATUS_LABEL, statusColour, useSlots, type Slot } from './idea-parts'
import { dayLabel, dayOfHook, landingDay } from './calendar-slot'
import {
  addIdea,
  addIdeaFromPosts,
  connectSource,
  pasteLink,
  skipSuggestion,
  suggest,
  useIdeas,
  type MoodSource,
} from './ideas-store'
import { IDEAS_HREF } from './idea-page'

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
  const { boards, references } = moodboardOf(brand.id)
  const [filter, setFilter] = React.useState<string>('all')
  // Pasted links live in the data module, so an idea keeps them and they outlast a view switch.
  // Read on every render: a paste and a reload from the server both notify the ideas store.
  const pasted = pastedReferences(brand.id)
  // The posts picked, in the order they were picked: the first lends the idea its words.
  const [selected, setSelected] = React.useState<string[]>([])
  // Whether a source is being added from the one "+" chip, shown under the chip row.
  const [adding, setAdding] = React.useState(false)
  const top = React.useRef<HTMLDivElement>(null)
  // Where the chip that opened the setup starts, so on a wide screen the setup opens under it.
  const [anchor, setAnchor] = React.useState(0)

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

  // The brand's board sections on Pinterest, everything sent by DM or pasted as a link, then the
  // brand's TikTok saves. Pins come only from the board.
  const folders: Array<{ id: string; label: string; source: MoodSource; pins: Reference[] }> = [
    ...(sources.pinterest
      ? boards.map((b) => ({ id: b.id, label: b.name, source: 'pinterest' as const, pins: b.pins }))
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
  const chips = [
    { id: 'all', label: 'All', source: null },
    ...folders.map((f) => ({ id: f.id, label: f.label, source: f.source })),
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
          <div
            role="tablist"
            aria-label="Folders"
            className="flex flex-wrap items-center gap-1.5 max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:[scrollbar-width:none] max-md:[&>*]:shrink-0"
          >
            {chips.map((c) => {
              const on = c.id === filter
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFilter(c.id)}
                  className={`flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`}
                >
                  {c.source && <PlatformLogo platform={SOURCE_LOGO[c.source]} size={11} />}
                  {c.label}
                </button>
              )
            })}
            {missing.length > 0 && (
              <button
                type="button"
                aria-label="Add a source"
                aria-expanded={adding}
                onClick={(e) => {
                  const row = top.current?.getBoundingClientRect()
                  const chip = e.currentTarget.getBoundingClientRect()
                  // Kept on screen: a chip near the right edge opens the setup leftwards.
                  if (row) setAnchor(Math.min(chip.left - row.left, row.width - 360 - 40))
                  setAdding((a) => !a)
                }}
                className="flex size-9 items-center justify-center rounded-full text-ink-3 shadow-[inset_0_0_0_1px_var(--cal-ghost)] transition-colors hover:text-ink"
              >
                <PlusIcon size={12} />
              </button>
            )}
          </div>
        )}
        {adding && missing.length > 0 && (
          <div
            style={{ '--x': `${anchor}px` } as React.CSSProperties}
            className="bb-pop absolute top-full left-(--x) mt-1 w-[360px] rounded-[18px] bg-page p-5 shadow-[0_0_0_1px_var(--line),0_16px_40px_-16px_rgba(0,0,0,0.22)] max-md:right-4 max-md:left-4 max-md:w-auto"
          >
            <AddSource missing={missing} />
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

/** One more source for the board: the only one left sets up at once; otherwise, pick first. */
function AddSource({ missing }: { missing: MoodSource[] }) {
  const [picked, setPicked] = React.useState<MoodSource | null>(null)
  const source = missing.length === 1 ? missing[0]! : picked
  if (source) return <SourceSetup source={source} />
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

/**
 * Setting up one source. Pinterest: the team's one account keeps a board per brand, and this
 * brand's board is the one that connects; the others belong to their own brands. Instagram: the
 * steps to DM a post to the moodboard account, then a button to turn the source on.
 */
function SourceSetup({ source }: { source: MoodSource }) {
  const { brand, brands } = useBrand()
  const [busy, setBusy] = React.useState(false)

  function connect() {
    if (busy) return
    setBusy(true)
    window.setTimeout(() => connectSource(brand.id, source), 900)
  }

  const action = (label: string) => (
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
          const pins = moodboardOf(b.id).boards.reduce((n, s) => n + s.pinCount, 0)
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

function ConnectSources() {
  const { brand } = useBrand()
  const { boards } = moodboardOf(brand.id)
  const [open, setOpen] = React.useState<MoodSource | null>(null)

  return (
    <section
      aria-label="Connect your accounts"
      className="mx-auto flex max-w-[620px] flex-col items-center gap-6 py-16 text-center"
    >
      <span className="flex -space-x-6 max-[360px]:-space-x-10">
        {boards
          .flatMap((b) => b.covers.slice(0, 2))
          .slice(0, 4)
          .map((src, i) => (
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
        <div key={open} className="bb-pop w-full max-w-[420px] rounded-[18px] bg-surface-2 p-5">
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
