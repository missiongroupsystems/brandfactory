'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Segmented } from '@/components/controls'
import { CheckIcon, PlusIcon, SparkIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import {
  IDEAS_BY_BRAND,
  type IdeaCard,
  type IdeaFormat,
  type IdeaStatus,
  type Moment,
  type Reference,
} from '@/data/ideas'
import { dayOf } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'

import {
  EYEBROW,
  FormatIcon,
  STATUS_LABEL,
  pictureOf,
  statusColour,
  useSlots,
  type Slot,
} from './idea-parts'
import { dayLabel, dayOfHook, landingDay } from './calendar-slot'
import {
  addIdea,
  connectSource,
  skipSuggestion,
  suggest,
  useIdeas,
  type MoodSource,
} from './ideas-store'

const HAIR = 'border-(--cal-line)'

/** One shelf per format, each tile drawn at the shape the post will have. */
const FORMATS: Array<{ format: IdeaFormat; title: string; where: string; ratio: string }> = [
  { format: 'reel', title: 'Reels', where: 'Instagram Reels · TikTok', ratio: 'aspect-[9/16]' },
  {
    format: 'carousel',
    title: 'Carousels',
    where: 'Instagram · swipe posts',
    ratio: 'aspect-[4/5]',
  },
  {
    format: 'story',
    title: 'Stories',
    where: 'Instagram Stories · 24 hours',
    ratio: 'aspect-[9/16]',
  },
]

type View = 'formats' | 'board'

/**
 * The ideas page, in two views. "Moodboard", the default, is one board of everything the brand
 * saved on Pinterest, Instagram and TikTok. "Current ideas" shelves the month's ideas as reels,
 * carousels and stories, each tile at the post's own shape, with the moments ahead below. A card
 * opens its plan on the shoot brief, where a pin's new idea goes straight away.
 */
export function IdeatePage() {
  const { brand } = useBrand()
  const { ideas, suggesting, target, suggestedFrom } = useIdeas(brand.id)
  const slots = useSlots()
  // The month's target is feed posts; stories ride alongside and do not fill a slot.
  const own = ideas.filter((i) => i.status !== 'suggested' && i.format !== 'story').length
  const suggestedCount = ideas.filter((i) => i.status === 'suggested').length
  // The moodboard first: ideas start from what the team saved.
  const [view, setView] = React.useState<View>('board')
  const [toast, setToast] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-end justify-between gap-x-8 gap-y-5 px-10 pt-6 pb-8 max-md:px-4 max-md:pt-2">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>{brand.name} · October · 2 a week</span>
            <h1 className="font-display tracking-[-0.035em] text-[56px] leading-none max-md:text-[44px]">
              Ideas
            </h1>
          </div>
          <div className="w-[240px]">
            <Segmented
              label="View"
              pill
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Moodboard' },
                { value: 'formats', label: 'Current ideas' },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Link
            href="/ideate/brief"
            className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
          >
            Shoot brief
            <ArrowIcon />
          </Link>
          <GapMeter
            own={Math.min(own, target)}
            suggested={suggesting ? suggestedCount : 0}
            target={target}
          />
          {suggesting ? (
            suggestedCount > 0 && (
              <span className="bb-rise flex h-10 items-center gap-2 rounded-full bg-(--insight-1) px-4 text-[13px] font-medium text-(--insight-6)">
                <SparkIcon size={10} />
                {suggestedCount} suggested from your {suggestedFrom}
              </span>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                suggest(brand.id)
                setView('formats')
              }}
              className="bb-press flex h-10 items-center gap-2 rounded-full bg-ink pr-5 pl-4 text-[13.5px] font-medium text-page hover:opacity-85"
            >
              <span className="text-(--insight-3)">
                <SparkIcon size={11} />
              </span>
              Suggest the last {Math.max(target - own, 0)}
            </button>
          )}
        </div>
      </div>

      <main
        key={`${brand.id}-${view}`}
        className="bb-swap mx-auto w-full max-w-[1440px] px-10 pb-24 max-md:px-4"
      >
        {view === 'formats' ? <Formats slots={slots} onToast={setToast} /> : <Board />}
      </main>

      {toast && (
        <div
          role="status"
          className="bb-rise fixed right-6 bottom-6 z-50 flex h-11 items-center gap-3 rounded-full bg-ink pr-2 pl-4 text-[13px] font-medium text-page shadow-lift max-md:right-4 max-md:bottom-4"
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

/** A ring: the month's eight slots, filled by the team's ideas, and the suggestions in light green. */
function GapMeter({ own, suggested, target }: { own: number; suggested: number; target: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  const n = own + suggested
  const full = n >= target
  return (
    <span className="flex items-center gap-3">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--track)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--insight-3)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(c * (own + suggested)) / target} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
        />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--insight-5)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(c * own) / target} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
        />
      </svg>
      <span className="flex flex-col">
        <span className="font-display text-[26px] leading-none tabular-nums">
          {Math.min(n, target)} of {target}
        </span>
        <span className={`${EYEBROW} mt-1`}>
          {n > target
            ? `October is full · ${n - target} spare`
            : full
              ? 'October is full'
              : `${target - n} open`}
        </span>
      </span>
    </span>
  )
}

// ── By format ────────────────────────────────────────────────────────────────────────────────

function Formats({ slots, onToast }: { slots: Slot[]; onToast: (t: string) => void }) {
  const { brand } = useBrand()
  const covers = React.useMemo(() => {
    // An idea's own photo always shows; a borrowed one only if no other tile shows it already.
    const seen = new Set(slots.flatMap(({ card }) => (card.image ? [card.image] : [])))
    const out: Record<string, string | undefined> = {}
    for (const { card } of slots) {
      if (card.image) {
        out[card.id] = card.image
        continue
      }
      const src = pictureOf(brand.id, card)
      out[card.id] = src && !seen.has(src) ? src : undefined
      if (src) seen.add(src)
    }
    return out
  }, [slots, brand.id])
  return (
    <div className="flex flex-col gap-14">
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-10 max-xl:grid-cols-2 max-lg:grid-cols-1 max-lg:gap-14">
        {FORMATS.map((f) => (
          <FormatShelf
            key={f.format}
            shelf={f}
            slots={slots.filter((s) => s.card.format === f.format)}
            covers={covers}
          />
        ))}
      </div>
      <Moments moments={IDEAS_BY_BRAND[brand.id].moments} onToast={onToast} />
    </div>
  )
}

const SHELF_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-x-4 gap-y-7 max-sm:grid-cols-2 max-sm:gap-x-3'

function FormatShelf({
  shelf,
  slots,
  covers,
}: {
  shelf: (typeof FORMATS)[number]
  slots: Slot[]
  covers: Record<string, string | undefined>
}) {
  return (
    <section aria-label={shelf.title} className="flex flex-col gap-4">
      <div className={`flex items-baseline justify-between gap-4 border-b ${HAIR} pb-3`}>
        <span className="flex items-baseline gap-3">
          <span className="translate-y-[2px] text-ink-3">
            <FormatIcon format={shelf.format} size={15} />
          </span>
          <h2 className="font-display text-[28px] leading-none">{shelf.title}</h2>
          <span className="font-mono text-[12px] text-ink-4 tabular-nums">{slots.length}</span>
        </span>
        <span className={`${EYEBROW} max-sm:hidden`}>{shelf.where}</span>
      </div>
      <ul className={SHELF_GRID}>
        {slots.map((s, i) => (
          <IdeaTile
            key={s.card.id}
            slot={s}
            src={covers[s.card.id]}
            ratio={shelf.ratio}
            index={i}
          />
        ))}
        <NewTile format={shelf.format} ratio={shelf.ratio} />
      </ul>
    </section>
  )
}

/**
 * The idea at the shape of the post: its picture, or the shot it plans set in type on the brand
 * tint, when it has no picture or an earlier tile already shows the same one.
 */
function Cover({ card, src, sizes }: { card: IdeaCard; src?: string; sizes: string }) {
  const { brand } = useBrand()
  if (src) return <Image src={src} alt="" fill sizes={sizes} className="object-cover" />
  return (
    <span
      className="absolute inset-0 flex flex-col justify-end gap-2 p-4"
      style={{
        background: `linear-gradient(165deg, color-mix(in oklab, var(${brand.colour}) 20%, var(--page)) 0%, var(--tile) 90%)`,
      }}
    >
      <span className="text-ink/40">
        <FormatIcon format={card.format} size={14} />
      </span>
      <span className="line-clamp-5 font-display text-[15px] leading-[1.2] text-ink/75">
        {card.angle || card.hook}
      </span>
    </span>
  )
}

function IdeaTile({
  slot,
  src,
  ratio,
  index,
}: {
  slot: Slot
  src?: string
  ratio: string
  index: number
}) {
  const { brand } = useBrand()
  const { card, status, label } = slot
  const suggested = status === 'suggested'
  return (
    <li
      className="bb-rise flex min-w-0 flex-col gap-2.5"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <Link
        href={`/ideate/brief#${card.id}`}
        aria-label={`Plan: ${card.hook}, ${STATUS_LABEL[status].toLowerCase()}`}
        className={`group/tile relative block w-full overflow-hidden rounded-[14px] bg-tile text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift ${ratio} ${suggested ? 'shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--insight-4)]' : ''}`}
      >
        <Cover card={card} src={src} sizes="220px" />
        <span className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
          <span className="rounded-full bg-(--tile-pill) px-2 py-[3px] font-mono text-[9.5px] tracking-[0.06em] whitespace-nowrap text-ink uppercase">
            {label ? label.slice(4) : 'No day'}
          </span>
          {suggested ? (
            <span className="flex items-center gap-1 rounded-full bg-(--insight-5) px-2 py-[3px] font-mono text-[9.5px] tracking-[0.06em] text-page uppercase">
              <SparkIcon size={7} />
              New
            </span>
          ) : (
            <StatusPill status={status} />
          )}
        </span>
        {src && !card.image && (
          <span
            title="A reference photo, not this idea's own"
            className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-[3px] font-mono text-[9px] tracking-[0.06em] text-page uppercase"
          >
            Ref
          </span>
        )}
      </Link>
      <span className="flex min-w-0 flex-col gap-1 px-0.5">
        <span className="line-clamp-2 font-display text-[16px] leading-[1.15] ">“{card.hook}”</span>
        <span className="font-mono text-[9.5px] tracking-[0.06em] text-ink-4 uppercase">
          {card.pillar}
        </span>
      </span>
      {suggested && (
        <span className="flex items-center gap-1.5 px-0.5">
          <Link
            href={`/ideate/brief#${card.id}`}
            aria-label={`Review: ${card.hook}`}
            className="bb-press flex h-7 items-center rounded-full bg-ink px-3 text-[11.5px] font-medium text-page hover:opacity-85"
          >
            Review
          </Link>
          <button
            type="button"
            aria-label={`Skip: ${card.hook}`}
            onClick={() => skipSuggestion(brand.id, card.id)}
            className="h-7 rounded-full px-2.5 text-[11.5px] text-ink-3 transition-colors hover:text-ink"
          >
            Skip
          </button>
        </span>
      )}
    </li>
  )
}

/** The idea's stage on the tile, in the calendar's colour for that stage. */
function StatusPill({ status }: { status: IdeaStatus }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-(--tile-pill) px-2 py-[3px] text-[10.5px] font-medium text-ink">
      <span className="size-1.5 rounded-full" style={{ background: statusColour(status) }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** The last tile on a shelf: tap it, write a hook, Enter. The idea lands on this shelf. */
function NewTile({ format, ratio }: { format: IdeaFormat; ratio: string }) {
  const { brand } = useBrand()
  const [writing, setWriting] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const field = React.useRef<HTMLTextAreaElement>(null)

  // The tile turns into the field the user just asked for, so the cursor goes there.
  React.useEffect(() => {
    if (writing) field.current?.focus()
  }, [writing])

  function capture() {
    const hook = draft.trim()
    if (!hook) return setWriting(false)
    addIdea(
      brand.id,
      { format, pillar: 'Craft', hook, angle: '', feature: brand.name, shots: [], sharper: [] },
      { kind: 'own' },
    )
    setDraft('')
    setWriting(false)
  }

  return (
    <li className="flex min-w-0 flex-col">
      {writing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            capture()
          }}
          className={`flex w-full flex-col justify-end rounded-[14px] bg-surface p-4 shadow-[inset_0_0_0_1px_var(--ink)] ${ratio}`}
        >
          <textarea
            ref={field}
            value={draft}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={capture}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                capture()
              }
              if (e.key === 'Escape') setWriting(false)
            }}
            placeholder="The hook, then Enter"
            aria-label={`New ${format} idea`}
            className="w-full resize-none bg-transparent font-display text-[20px] leading-[1.1] outline-none placeholder:font-sans placeholder:text-[13px] placeholder:text-ink-5"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-(--cal-ghost) text-ink-4 transition-colors hover:border-(--line-strong) hover:bg-surface-2 hover:text-ink ${ratio}`}
        >
          <PlusIcon size={14} />
          <span className="text-[12.5px] font-medium">New {format}</span>
        </button>
      )}
    </li>
  )
}

function Moments({ moments, onToast }: { moments: Moment[]; onToast: (t: string) => void }) {
  const { brand, weeks, byId, addIdeaToCalendar } = useBrand()
  const [used, setUsed] = React.useState<Record<string, string>>({})

  function use(m: Moment) {
    const dayN = landingDay(weeks, m.dayN)
    if (!dayN || m.seed.format === 'story') return
    const where = addIdeaToCalendar(
      { format: m.seed.format, hook: m.seed.hook, why: m.title },
      dayN,
    )
    if (!where) return
    addIdea(brand.id, { ...m.seed, dayN }, { kind: 'moment', title: m.title })
    setUsed((u) => ({ ...u, [m.id]: where }))
    onToast(`On the calendar · ${where}`)
  }

  return (
    <section aria-label="Moments ahead" className="flex flex-col gap-4">
      <div className={`flex items-baseline justify-between gap-4 border-b ${HAIR} pb-3`}>
        <h2 className="font-display text-[28px] leading-none">Moments ahead</h2>
        <span className={`${EYEBROW} max-sm:hidden`}>Near you · this month</span>
      </div>
      <ul className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        {moments.map((m) => {
          const on =
            used[m.id] ??
            (() => {
              const n = dayOfHook(weeks, m.seed.hook, (id) => byId(id)?.hook)
              return n ? dayLabel(weeks, n) : null
            })()
          return (
            <li key={m.id} className="flex flex-col gap-2 rounded-[14px] bg-surface-2 p-4">
              <span className="flex items-center justify-between gap-3">
                <span className={EYEBROW}>{m.when}</span>
                <span className={EYEBROW}>{m.near}</span>
              </span>
              <span className="text-[14px] font-medium">{m.title}</span>
              <span className="truncate font-display text-[17px] leading-[1.15] ">
                “{m.seed.hook}”
              </span>
              {on ? (
                <Link
                  href="/"
                  className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-(--insight-6) hover:underline"
                >
                  <span className="flex size-3.5 items-center justify-center rounded-full bg-(--insight-5) text-page">
                    <CheckIcon size={7} strokeWidth={2.4} />
                  </span>
                  On calendar · {on}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => use(m)}
                  className="mt-1 flex w-fit items-center gap-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
                >
                  <PlusIcon size={9} />
                  Use in an open slot
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── Pinterest ────────────────────────────────────────────────────────────────────────────────

const SOURCE_NAME: Record<MoodSource, string> = {
  pinterest: 'Pinterest',
  ig: 'Instagram',
  tt: 'TikTok',
}

/**
 * The moodboard: one board for everything the team saved, from this brand's own accounts only —
 * its Pinterest boards, its Instagram saved folder and its TikTok favourites. Each connects with a
 * short mock sign-in (no backend). A folder chip and a small logo under each tile say where a
 * post came from; nothing is ever mixed in from another brand's accounts.
 */
function Board() {
  const { brand } = useBrand()
  const { sources } = useIdeas(brand.id)
  const { boards, references } = IDEAS_BY_BRAND[brand.id]
  const [filter, setFilter] = React.useState<string>('all')
  const [pasted, setPasted] = React.useState<Reference[]>([])

  if (!sources.pinterest && !sources.ig && !sources.tt) return <ConnectSources />

  // Saved posts are the brand's Instagram and TikTok bookmarks; a pasted link joins its platform.
  const saved = [...pasted, ...references]
  const folders: Array<{ id: string; label: string; source: MoodSource; pins: Reference[] }> = [
    ...(sources.pinterest
      ? boards.map((b) => ({ id: b.id, label: b.name, source: 'pinterest' as const, pins: b.pins }))
      : []),
    ...(sources.ig
      ? [
          {
            id: 'ig',
            label: 'Saved',
            source: 'ig' as const,
            pins: saved.filter((r) => r.platform === 'ig'),
          },
        ]
      : []),
    ...(sources.tt
      ? [
          {
            id: 'tt',
            label: 'Favourites',
            source: 'tt' as const,
            pins: saved.filter((r) => r.platform === 'tt'),
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
    { id: 'all', label: 'All', source: null, n: all.length },
    ...folders.map((f) => ({ id: f.id, label: f.label, source: f.source, n: f.pins.length })),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Folders" className="flex flex-wrap items-center gap-1.5">
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
                {c.source && <PlatformLogo platform={c.source} size={11} />}
                {c.label}
                <span
                  className={`font-mono text-[11px] tabular-nums ${on ? 'text-page/60' : 'text-ink-4'}`}
                >
                  {c.n}
                </span>
              </button>
            )
          })}
          {missing.map((m) => (
            <ConnectChip key={m} source={m} />
          ))}
        </div>
        <span className="text-[12px] text-ink-4">
          Synced from {brand.name}&rsquo;s accounts · just now
        </span>
      </div>
      {(filter === 'ig' || filter === 'tt') && (
        <PasteLink onPaste={(r) => setPasted((p) => [r, ...p])} />
      )}
      <Masonry key={filter} pins={shown} />
    </div>
  )
}

/** A dashed chip for an account not connected yet: one tap runs the same mock sign-in. */
function ConnectChip({ source }: { source: MoodSource }) {
  const { brand } = useBrand()
  const [busy, setBusy] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        if (busy) return
        setBusy(true)
        window.setTimeout(() => connectSource(brand.id, source), 900)
      }}
      className="flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium text-ink-3 shadow-[inset_0_0_0_1px_var(--cal-ghost)] transition-colors hover:text-ink"
    >
      {busy ? (
        <span className="size-3 animate-spin rounded-full border-[1.5px] border-ink/20 border-t-ink" />
      ) : (
        <PlatformLogo platform={source} size={11} />
      )}
      {busy ? 'Connecting…' : `Add ${SOURCE_NAME[source]}`}
    </button>
  )
}

function ConnectSources() {
  const { brand } = useBrand()
  const { boards } = IDEAS_BY_BRAND[brand.id]
  const [connecting, setConnecting] = React.useState<MoodSource | null>(null)

  function connect(source: MoodSource) {
    if (connecting) return
    setConnecting(source)
    window.setTimeout(() => connectSource(brand.id, source), 1100)
  }

  return (
    <section
      aria-label="Connect your accounts"
      className="mx-auto flex max-w-[620px] flex-col items-center gap-6 py-16 text-center"
    >
      <span className="flex -space-x-6">
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
              <Image src={src} alt="" fill sizes="100px" className="object-cover" />
            </span>
          ))}
      </span>
      <span className="flex flex-col gap-2">
        <span className="font-display text-[32px] leading-none">Bring in your moodboard</span>
        <span className="text-[14px] text-ink-3">
          Everything {brand.name} saved, in one place. Tap a post to turn it into an idea.
        </span>
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {(Object.keys(SOURCE_NAME) as MoodSource[]).map((source) => {
          const busy = connecting === source
          const dark = source === 'pinterest'
          return (
            <button
              key={source}
              type="button"
              onClick={() => connect(source)}
              aria-live="polite"
              className={`bb-press flex h-11 min-w-[176px] items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium hover:opacity-85 ${dark ? 'bg-ink text-page' : 'bg-surface text-ink'}`}
            >
              {busy ? (
                <>
                  <span
                    className={`size-3 animate-spin rounded-full border-[1.5px] ${dark ? 'border-white/30 border-t-white' : 'border-ink/20 border-t-ink'}`}
                  />
                  Connecting…
                </>
              ) : (
                <>
                  <PlatformLogo platform={source} size={14} />
                  {SOURCE_NAME[source]}
                </>
              )}
            </button>
          )
        })}
      </div>
      <span className="text-[12px] text-ink-4">{brand.name}&rsquo;s own accounts only</span>
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

/** Pins at their own shape in columns, the way Pinterest lays out a board. */
function Masonry({ pins }: { pins: Reference[] }) {
  const { brand, weeks, byId } = useBrand()
  const router = useRouter()
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

  function ideaOf(ref: Reference) {
    return ideas.find((i) => i.referenceId === ref.id && i.status !== 'suggested')
  }

  /** "Used · 23 Oct", or "Used" while its idea has no day. */
  function usedOn(card: IdeaCard): string {
    const n = card.postId
      ? dayOf(weeks, card.postId)
      : dayOfHook(weeks, card.hook, (id) => byId(id)?.hook)
    const label = n ? dayLabel(weeks, n) : null
    return label ? `In plan · ${label.slice(4)}` : 'In plan'
  }

  /** A pin already used opens its idea; a new one goes to the shoot brief to be planned. */
  function open(ref: Reference) {
    const card = ideaOf(ref)
    if (card) return router.push(`/ideate/brief#${card.id}`)
    const id = addIdea(
      brand.id,
      { ...ref.seed, referenceId: ref.id },
      { kind: 'reference', account: ref.account },
    )
    router.push(`/ideate/brief#${id}`)
  }

  return (
    <div ref={box} className="flex items-start gap-4 max-sm:gap-3">
      {toColumns(pins, count).map((column, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-6">
          {column.map(({ ref, i }) => {
            const card = ideaOf(ref)
            return (
              <div
                key={ref.id}
                className="bb-deal flex flex-col gap-2"
                style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
              >
                <button
                  type="button"
                  onClick={() => open(ref)}
                  aria-label={`${card ? 'Open the idea from' : 'Start an idea from'} ${ref.account}: ${ref.borrow}`}
                  className="group/pin relative block w-full overflow-hidden rounded-[16px] bg-tile text-left"
                  style={{ aspectRatio: `1 / ${ref.ratio ?? 1.25}` }}
                >
                  {ref.image && (
                    <Image
                      src={ref.image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, 280px"
                      className="object-cover transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] group-hover/pin:scale-[1.03]"
                    />
                  )}
                  <span className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover/pin:bg-black/25" />
                  {card && (
                    // Used: a quiet frosted check, the way a photos app marks a picked image.
                    <span
                      aria-hidden="true"
                      className="absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full bg-white/80 text-ink shadow-[0_1px_6px_rgba(0,0,0,0.18)] backdrop-blur-md"
                    >
                      <CheckIcon size={9} strokeWidth={2.4} />
                    </span>
                  )}
                  <span className="absolute top-2.5 right-2.5 flex h-8 translate-y-1 items-center gap-1.5 rounded-full bg-page px-3 text-[12px] font-medium text-ink opacity-0 shadow-soft transition-[opacity,transform] duration-200 group-hover/pin:translate-y-0 group-hover/pin:opacity-100 group-focus-visible/pin:translate-y-0 group-focus-visible/pin:opacity-100 max-md:hidden">
                    {card ? (
                      'Open idea'
                    ) : (
                      <>
                        <PlusIcon size={9} />
                        Start idea
                      </>
                    )}
                  </span>
                </button>
                <span className="flex flex-col gap-1.5 px-1">
                  <span className="text-[13px] leading-[1.3] text-ink">{ref.borrow}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      title={SOURCE_NAME[ref.platform]}
                      className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface"
                    >
                      <PlatformLogo platform={ref.platform} size={12} brand />
                    </span>
                    <span className="truncate text-[12px] text-ink-2">{ref.account}</span>
                    {card && (
                      <span className="ml-auto shrink-0 text-[11.5px] text-ink-4">
                        {usedOn(card)}
                      </span>
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
      id: `pasted-${Date.now()}`,
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
        placeholder="Paste an Instagram or TikTok link"
        aria-label="Paste an Instagram or TikTok link"
        className="h-10 w-full rounded-full bg-surface px-4 text-[13px] outline-none placeholder:text-ink-5 focus:bg-paper"
      />
    </form>
  )
}

function ArrowIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6h7M6.5 3l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
