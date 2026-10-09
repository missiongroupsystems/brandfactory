'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { Segmented } from '@/components/controls'
import { CheckIcon, CloseIcon, PlusIcon, SparkIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import {
  IDEAS_BY_BRAND,
  inspirationOf,
  pasteReference,
  pastedReferences,
  type IdeaCard,
  type IdeaFormat,
  type Moment,
  type Reference,
} from '@/data/ideas'
import { dayOf } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'

import {
  EYEBROW,
  FormatIcon,
  STATUS_LABEL,
  statusColour,
  useRename,
  useSlots,
  type Slot,
} from './idea-parts'
import { dayLabel, dayOfHook, landingDay } from './calendar-slot'
import {
  addIdea,
  addIdeaFromPosts,
  connectSource,
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
 * The ideas page, in two views. "Moodboard", the default, is one board of everything the brand
 * saved on Pinterest, Instagram and TikTok: pick any number of posts and plan an idea from them.
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
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-10 pt-6 pb-8 max-md:px-4 max-md:pt-2 max-md:pb-5">
        <div className="flex flex-col gap-3">
          <span className={EYEBROW}>{brand.name} · October</span>
          <h1 className="font-display tracking-[-0.035em] text-[56px] leading-none max-md:text-[34px]">
            Ideas
          </h1>
        </div>
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

  // A moment already used is one of the ideas now, so it leaves the list. Its idea is found by
  // the moment's title, which a sharper hook does not change, or else by its hook on the calendar.
  const moments = IDEAS_BY_BRAND[brand.id].moments.filter(
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
    const where = addIdeaToCalendar({ format: card.format, hook: card.hook, why }, card.dayN)
    if (!where) return router.push(ideaHref(card.id))
    onToast(`On the calendar · ${where}`)
  }

  function takeMoment(m: Moment) {
    const dayN = landingDay(weeks, m.dayN)
    if (!dayN || m.seed.format === 'story') return
    const where = addIdeaToCalendar(
      { format: m.seed.format, hook: m.seed.hook, why: m.title },
      dayN,
    )
    if (!where) return
    addIdea(brand.id, { ...m.seed, dayN }, { kind: 'moment', title: m.title })
    onToast(`On the calendar · ${where}`)
  }

  return (
    <div className="flex flex-col gap-14">
      <section aria-label="Ideas" className="flex flex-col gap-6">
        <div className="flex h-9 items-center justify-between">
          <span className={EYEBROW}>
            {own} of {target} this month
          </span>
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
        </div>
        <ul className={GRID}>
          {slots.map((slot) => (
            <li key={slot.card.id}>
              <IdeaView slot={slot} onPlan={() => plan(slot.card)} />
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
              <span className="text-[11.5px]">From the moodboard</span>
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

/** One idea in the overview: its collage, its hook, where it stands, and what to do next. */
function IdeaView({ slot, onPlan }: { slot: Slot; onPlan: () => void }) {
  const { brand } = useBrand()
  const { card, status, label, placed } = slot
  const suggested = status === 'suggested'
  const href = ideaHref(card.id)
  const [sharpen, setSharpen] = React.useState(false)
  const photos = [card.image, ...inspirationOf(brand.id, card).map((p) => p.image)].filter(
    (src, i, a): src is string => Boolean(src) && a.indexOf(src) === i,
  )
  const source = sourceOf(card)

  return (
    <article className="flex flex-col gap-3">
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
      <span className="flex items-center gap-4 px-0.5">
        {suggested ? (
          <>
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
          </>
        ) : placed ? (
          <Link href={href} className={`${ACT} text-ink hover:opacity-70`}>
            Brief
          </Link>
        ) : (
          <button type="button" onClick={onPlan} className={`${ACT} text-ink hover:opacity-70`}>
            Plan it
          </button>
        )}
        {card.sharper.length > 0 && (
          <button
            type="button"
            aria-expanded={sharpen}
            onClick={() => setSharpen((s) => !s)}
            className={`${ACT} ${sharpen ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}
          >
            Sharpen
          </button>
        )}
      </span>
      {sharpen && <Sharper card={card} />}
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

/** Three stronger hooks under the idea; picking one swaps it in, picking it again puts back the team's. */
function Sharper({ card }: { card: IdeaCard }) {
  const use = useRename(card)
  // The hook as it was when the list opened, so a second click has somewhere to go.
  const [mine] = React.useState(card.hook)
  return (
    <div role="radiogroup" aria-label="Sharper hooks" className="bb-rise flex w-full flex-col">
      {card.sharper.map((s) => {
        const on = s.text === card.hook
        return (
          <button
            key={s.text}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => use(on ? mine : s.text)}
            className="group/sharp flex items-baseline justify-between gap-3 border-b border-(--cal-line) py-2.5 text-left"
          >
            <span
              className={`font-display text-[16px] leading-[1.2] transition-colors ${on ? 'text-ink' : 'text-ink-3 group-hover/sharp:text-ink'}`}
            >
              {s.text}
            </span>
            {on ? (
              <CheckIcon size={10} strokeWidth={2.2} />
            ) : (
              <span className="font-mono text-[9.5px] tracking-[0.08em] text-ink-5">{s.tag}</span>
            )}
          </button>
        )
      })}
    </div>
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
  ig: 'Instagram',
  tt: 'TikTok',
}

/**
 * The moodboard: one board for everything the team saved, from this brand's own accounts: its
 * Pinterest boards, its Instagram saved folder and its TikTok favourites. Each connects with a
 * short mock sign-in (no backend). Tap posts to pick them; a bar then plans an idea from them.
 */
function Board({ onPlanned }: { onPlanned: (id: string) => void }) {
  const { brand } = useBrand()
  const { sources } = useIdeas(brand.id)
  const { boards, references } = IDEAS_BY_BRAND[brand.id]
  const [filter, setFilter] = React.useState<string>('all')
  // Pasted links live in the data module, so an idea keeps them and they outlast a view switch.
  const [pasted, setPasted] = React.useState<Reference[]>(() => pastedReferences(brand.id))
  // The posts picked, in the order they were picked: the first lends the idea its words.
  const [selected, setSelected] = React.useState<string[]>([])

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
      <div className="sticky top-0 z-30 -mx-10 bg-page px-10 py-2 max-md:-mx-4 max-md:px-4">
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
        )}
      </div>
      {(filter === 'ig' || filter === 'tt') && (
        <PasteLink
          onPaste={(r) => {
            pasteReference(brand.id, r)
            setPasted(pastedReferences(brand.id))
          }}
        />
      )}
      <Masonry key={filter} pins={shown} selected={selected} onToggle={toggle} />
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
  // Every account tapped joins one sign-in: each tap restarts the wait, and they connect together,
  // so the board opens once with all of them.
  const [connecting, setConnecting] = React.useState<MoodSource[]>([])
  const timer = React.useRef<number | undefined>(undefined)

  function connect(source: MoodSource) {
    if (connecting.includes(source)) return
    const next = [...connecting, source]
    setConnecting(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      for (const s of next) connectSource(brand.id, s)
    }, 1100)
  }

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
      <span className="flex flex-col gap-2">
        <span className="font-display text-[32px] leading-none">Bring in your moodboard</span>
        <span className="text-[14px] text-ink-3">
          Everything {brand.name} saved, in one place. Pick posts, then plan an idea from them.
        </span>
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {(Object.keys(SOURCE_NAME) as MoodSource[]).map((source) => {
          const busy = connecting.includes(source)
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
    const label = n ? dayLabel(weeks, n) : null
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
                      title={SOURCE_NAME[ref.platform]}
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
