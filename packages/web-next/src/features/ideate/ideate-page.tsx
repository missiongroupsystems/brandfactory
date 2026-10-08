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
  referenceById,
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
  pictureOf,
  statusColour,
  useRename,
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

const FORMAT_LABEL: Record<IdeaFormat, string> = {
  reel: 'Reel',
  carousel: 'Carousel',
  story: 'Story',
}

type View = 'ideas' | 'board'

/**
 * The ideas page, in two views. "Moodboard", the default, is one board of everything the brand
 * saved on Pinterest, Instagram and TikTok. "Current ideas" decides what to make: one idea at a
 * time, with the case for it, and a strip of every idea and the moments ahead to move between
 * them. When, and how it is shot, belong to the calendar and the shoot brief.
 */
export function IdeatePage() {
  const { brand } = useBrand()
  const slots = useSlots()
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
            <span className={EYEBROW}>{brand.name} · October</span>
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
                { value: 'ideas', label: 'Current ideas' },
              ]}
            />
          </div>
        </div>
        <Link
          href="/ideate/brief"
          className="flex h-10 items-center gap-2 rounded-full px-1 text-[13.5px] font-medium text-ink-3 transition-colors hover:text-ink"
        >
          Shoot brief
          <ArrowIcon />
        </Link>
      </div>

      <main
        key={`${brand.id}-${view}`}
        className="bb-swap mx-auto w-full max-w-[1440px] px-10 pb-16 max-md:px-4"
      >
        {view === 'ideas' ? <Ideas slots={slots} onToast={setToast} /> : <Board />}
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

// ── Current ideas ────────────────────────────────────────────────────────────────────────────

type Item = { kind: 'idea'; slot: Slot } | { kind: 'moment'; moment: Moment }

const keyOf = (item: Item) => (item.kind === 'idea' ? item.slot.card.id : item.moment.id)

/**
 * One idea at a time. The strip under it holds every idea, then the moments ahead not used yet;
 * a click, or the arrow keys, moves between them.
 */
function Ideas({ slots, onToast }: { slots: Slot[]; onToast: (t: string) => void }) {
  const { brand, weeks, byId, addIdeaToCalendar } = useBrand()
  const { ideas, suggesting, target } = useIdeas(brand.id)
  const [at, setAt] = React.useState<string | null>(null)
  const [writing, setWriting] = React.useState(false)

  // A moment already used is one of the ideas now, so it leaves the strip. Its idea is found by
  // the moment's title, which a sharper hook does not change, or else by its hook on the calendar.
  const moments = IDEAS_BY_BRAND[brand.id].moments.filter(
    (m) =>
      !ideas.some((i) => i.source.kind === 'moment' && i.source.title === m.title) &&
      !dayOfHook(weeks, m.seed.hook, (id) => byId(id)?.hook),
  )
  const items: Item[] = [
    ...slots.map((slot) => ({ kind: 'idea' as const, slot })),
    ...moments.map((moment) => ({ kind: 'moment' as const, moment })),
  ]
  const index = Math.max(
    0,
    items.findIndex((item) => keyOf(item) === at),
  )
  const current = items[index]
  const thumbs = React.useMemo(() => {
    // An idea's own photo always shows; a borrowed one only if no other thumb shows it already.
    const seen = new Set(slots.flatMap(({ card }) => (card.image ? [card.image] : [])))
    const out: Record<string, string | undefined> = {}
    for (const { card } of slots) {
      const src = pictureOf(brand.id, card)
      out[card.id] = card.image ?? (src && !seen.has(src) ? src : undefined)
      if (src) seen.add(src)
    }
    return out
  }, [slots, brand.id])
  // The month's target is feed posts; stories ride alongside and do not fill a slot.
  const own = ideas.filter((i) => i.status !== 'suggested' && i.format !== 'story').length
  const open = Math.max(target - own, 0)

  function pick(key: string) {
    setWriting(false)
    setAt(key)
  }

  // Left and right step through the strip, unless the user is writing or holds a modifier (Cmd and
  // Alt with an arrow are the browser's own back and forward).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (writing || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const next = items[(index + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]
      if (next) pick(keyOf(next))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function takeMoment(m: Moment) {
    const dayN = landingDay(weeks, m.dayN)
    if (!dayN || m.seed.format === 'story') return
    const where = addIdeaToCalendar(
      { format: m.seed.format, hook: m.seed.hook, why: m.title },
      dayN,
    )
    if (!where) return
    pick(addIdea(brand.id, { ...m.seed, dayN }, { kind: 'moment', title: m.title }))
    onToast(`On the calendar · ${where}`)
  }

  return (
    <div className="flex flex-col gap-12">
      {writing ? (
        <NewIdea onAdd={pick} onCancel={() => setWriting(false)} />
      ) : current?.kind === 'idea' ? (
        <IdeaSpread key={keyOf(current)} slot={current.slot} />
      ) : current?.kind === 'moment' ? (
        <MomentSpread
          key={keyOf(current)}
          moment={current.moment}
          onUse={() => takeMoment(current.moment)}
        />
      ) : null}

      <nav aria-label="Ideas" className="flex items-end gap-2.5 overflow-x-auto px-1 pt-2 pb-1">
        {items.map((item) => (
          <Thumb
            key={keyOf(item)}
            item={item}
            src={item.kind === 'idea' ? thumbs[item.slot.card.id] : undefined}
            on={!writing && item === current}
            onClick={() => pick(keyOf(item))}
          />
        ))}
        <button
          type="button"
          aria-label="New idea"
          title="New idea"
          onClick={() => setWriting(true)}
          className={`flex aspect-[4/5] h-[72px] shrink-0 items-center justify-center rounded-[8px] border border-dashed transition-colors ${writing ? 'border-ink text-ink' : 'border-(--cal-ghost) text-ink-4 hover:border-(--line-strong) hover:text-ink'}`}
        >
          <PlusIcon size={12} />
        </button>
        {!suggesting && open > 0 && (
          <button
            type="button"
            onClick={() => {
              suggest(brand.id)
              const first = ideas.find((i) => i.status === 'suggested')
              if (first) pick(first.id)
            }}
            className="ml-auto flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-(--insight-6) transition-colors hover:bg-(--insight-wash)"
          >
            <SparkIcon size={10} />
            Suggest {open}
          </button>
        )}
      </nav>
    </div>
  )
}

/**
 * The picture and the words beside it. Every picture is one size, 4:5, whatever the format, so
 * the words and the strip stay in place from one idea to the next.
 */
function Spread({ picture, children }: { picture: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bb-swap grid grid-cols-[320px_minmax(0,1fr)] items-start gap-16 max-md:grid-cols-1 max-md:gap-8">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[18px] bg-tile max-md:mx-auto max-md:w-[70%]">
        {picture}
      </div>
      <div className="flex max-w-[640px] flex-col items-start gap-6 pt-6 max-md:pt-0">
        {children}
      </div>
    </section>
  )
}

/** An idea's photo, or the brand tint with the format's mark when it has none. */
function Picture({
  format,
  src,
  sizes,
  small = false,
}: {
  format: IdeaFormat
  src?: string
  sizes: string
  small?: boolean
}) {
  const { brand } = useBrand()
  if (src) return <Image src={src} alt="" fill sizes={sizes} className="object-cover" />
  return (
    <span
      className="absolute inset-0 flex items-center justify-center text-ink/30"
      style={{
        background: `linear-gradient(165deg, color-mix(in oklab, var(${brand.colour}) 20%, var(--page)) 0%, var(--tile) 90%)`,
      }}
    >
      <FormatIcon format={format} size={small ? 11 : 22} />
    </span>
  )
}

const HOOK = 'font-display text-[52px] leading-[1.02] tracking-[-0.03em] max-md:text-[36px]'
const ACTION =
  'bb-press flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-page hover:opacity-85'
const QUIET =
  'h-11 rounded-full px-3 text-[14px] font-medium text-ink-3 transition-colors hover:text-ink'

function IdeaSpread({ slot }: { slot: Slot }) {
  const { brand } = useBrand()
  const { card, status, label } = slot
  const src = pictureOf(brand.id, card)
  const suggested = status === 'suggested'
  const [sharpen, setSharpen] = React.useState(false)

  return (
    <Spread picture={<Picture format={card.format} src={src} sizes="320px" />}>
      <span className={`${EYEBROW} flex items-center gap-2`}>
        <FormatIcon format={card.format} size={11} />
        {FORMAT_LABEL[card.format]} · {card.pillar}
      </span>
      <h2 className={HOOK}>{card.hook}</h2>
      {card.angle && <p className="text-[17px] leading-[1.5] text-ink-2">{card.angle}</p>}
      <Why card={card} />
      <span className="flex items-center gap-1">
        {suggested ? (
          <>
            <Link href={`/ideate/brief#${card.id}`} className={ACTION}>
              Review
            </Link>
            <button
              type="button"
              onClick={() => skipSuggestion(brand.id, card.id)}
              className={QUIET}
            >
              Skip
            </button>
          </>
        ) : (
          <Link href={`/ideate/brief#${card.id}`} className={ACTION}>
            Plan it
          </Link>
        )}
        {card.sharper.length > 0 && (
          <button
            type="button"
            aria-expanded={sharpen}
            onClick={() => setSharpen((s) => !s)}
            className={`${QUIET} ${sharpen ? 'text-ink' : ''}`}
          >
            Sharpen
          </button>
        )}
      </span>
      {sharpen && <Sharper card={card} />}
      <span className="flex items-center gap-2 text-[12.5px] text-ink-4">
        <span className="size-1.5 rounded-full" style={{ background: statusColour(status) }} />
        {[STATUS_LABEL[status], label, src && !card.image ? 'Reference photo' : null]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </Spread>
  )
}

/** Where the idea came from, in one line: the insight, the account it borrows from, the moment. */
function Why({ card }: { card: IdeaCard }) {
  const { brand } = useBrand()
  const s = card.source
  if (s.kind === 'insight' || (s.kind === 'suggested' && card.builtOn)) {
    return (
      <span className="flex items-center gap-2 text-[14px] text-(--insight-6)">
        <SparkIcon size={10} />
        {s.kind === 'insight' ? s.line : `Built on “${card.builtOn!.idea.hook}”`}
      </span>
    )
  }
  if (s.kind === 'reference') {
    const ref = card.referenceId ? referenceById(brand.id, card.referenceId) : undefined
    return (
      <span className="flex items-center gap-2 text-[14px] text-ink-2">
        {ref && <PlatformLogo platform={ref.platform} size={12} brand />}
        {s.account}
        {ref ? ` · ${ref.borrow}` : ''}
      </span>
    )
  }
  if (s.kind === 'moment') {
    return <span className="text-[14px] text-(--layer-holiday-ink)">{s.title}</span>
  }
  return null
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
            className="group/sharp flex items-baseline justify-between gap-4 border-b border-(--cal-line) py-3 text-left"
          >
            <span
              className={`font-display text-[20px] leading-[1.2] transition-colors ${on ? 'text-ink' : 'text-ink-3 group-hover/sharp:text-ink'}`}
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
function MomentSpread({ moment, onUse }: { moment: Moment; onUse: () => void }) {
  const [, day, month] = moment.when.split(' ')
  return (
    <Spread
      picture={
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-(--layer-holiday) text-(--layer-holiday-ink)">
          <span className="font-display text-[88px] leading-none tracking-[-0.04em]">{day}</span>
          <span className={EYEBROW}>{month}</span>
        </span>
      }
    >
      <span className={`${EYEBROW} flex items-center gap-2`}>
        <FormatIcon format={moment.seed.format} size={11} />
        {FORMAT_LABEL[moment.seed.format]} · {moment.when} · {moment.near}
      </span>
      <h2 className={HOOK}>{moment.seed.hook}</h2>
      <p className="text-[17px] leading-[1.5] text-ink-2">{moment.seed.angle}</p>
      <span className="text-[14px] text-(--layer-holiday-ink)">{moment.title}</span>
      <button type="button" onClick={onUse} className={ACTION}>
        Use it
      </button>
    </Spread>
  )
}

/** A blank idea: pick the format, write the hook, Enter. */
function NewIdea({ onAdd, onCancel }: { onAdd: (id: string) => void; onCancel: () => void }) {
  const { brand } = useBrand()
  const [format, setFormat] = React.useState<IdeaFormat>('reel')
  const [draft, setDraft] = React.useState('')
  const field = React.useRef<HTMLTextAreaElement>(null)

  // The user just asked for a new idea, so the cursor goes to its hook.
  React.useEffect(() => field.current?.focus(), [])

  function capture() {
    const hook = draft.trim()
    if (!hook) return onCancel()
    onAdd(
      addIdea(
        brand.id,
        { format, pillar: 'Craft', hook, angle: '', feature: brand.name, shots: [], sharper: [] },
        { kind: 'own' },
      ),
    )
  }

  return (
    <Spread picture={<Picture format={format} sizes="320px" />}>
      <span role="radiogroup" aria-label="Format" className="flex items-center gap-4">
        {(Object.keys(FORMAT_LABEL) as IdeaFormat[]).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={f === format}
            onClick={() => setFormat(f)}
            className={`${EYEBROW} transition-colors ${f === format ? 'text-ink' : 'hover:text-ink'}`}
          >
            {FORMAT_LABEL[f]}
          </button>
        ))}
      </span>
      <textarea
        ref={field}
        value={draft}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            capture()
          }
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Write the hook"
        aria-label="Hook"
        className={`${HOOK} w-full resize-none bg-transparent outline-none placeholder:text-ink-5`}
      />
    </Spread>
  )
}

/** One idea in the strip, at the size of every other; a moment shows its day on the holiday tint. */
function Thumb({
  item,
  src,
  on,
  onClick,
}: {
  item: Item
  src?: string
  on: boolean
  onClick: () => void
}) {
  const format = item.kind === 'idea' ? item.slot.card.format : item.moment.seed.format
  const hook = item.kind === 'idea' ? item.slot.card.hook : item.moment.seed.hook
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hook}
      aria-current={on}
      title={hook}
      className={`relative aspect-[4/5] h-[72px] shrink-0 overflow-hidden rounded-[8px] bg-tile transition-[opacity,transform,box-shadow] duration-200 ${on ? '-translate-y-1 shadow-[0_0_0_2px_var(--page),0_0_0_3.5px_var(--ink)]' : 'opacity-50 hover:opacity-100'}`}
    >
      {item.kind === 'idea' ? (
        <>
          <Picture format={format} src={src} sizes="58px" small />
          {item.slot.status === 'suggested' && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-(--insight-5) shadow-[0_0_0_1.5px_var(--page)]" />
          )}
        </>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-(--layer-holiday) font-mono text-[12px] text-(--layer-holiday-ink)">
          {item.moment.when.split(' ')[1]}
        </span>
      )}
    </button>
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
