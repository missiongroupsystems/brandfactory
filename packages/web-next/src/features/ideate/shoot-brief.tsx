'use client'

import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'

import { CheckIcon, CloseIcon, PlusIcon, SparkIcon } from '@/components/icons'
import { fromFile, Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { Sheet } from '@/components/sheet'
import { usePhone } from '@/components/use-phone'
import type { Stage, Week } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import { inspirationOf, type IdeaCard, type IdeaStatus } from '@/data/ideas'
import { storyTaken } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'

import { dayLabel, landingDay } from './calendar-slot'
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
import { editIdea, keepSuggestion, setDay, skipSuggestion } from './ideas-store'

const HAIR = 'border-(--cal-line)'
const TIMES = ['08:00', '12:00', '15:00', '18:00', '19:30', '21:00']
const FORMAT_LABEL = { reel: 'Reel', carousel: 'Carousel', story: 'Story' } as const

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
 * One idea's shoot brief: its words, its plan (status, date and time, which make it a post on
 * the calendar), its shots, its inspiration and its sharper hooks. A side panel on a wide screen,
 * a sheet on a phone; the ideas page opens it beside the overview, so no idea takes the page.
 */
export function IdeaBrief({ id, onClose }: { id: string; onClose: () => void }) {
  const slots = useSlots()
  const plans = usePlans(slots)
  const phone = usePhone()
  const slot = slots.find((s) => s.card.id === id)
  const plan = plans[id]

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The card can go while its brief is open (a skipped suggestion, a brand switch, a reload that
  // lost an idea made this session): the brief closes rather than leaving a dead hash in the URL.
  const gone = !slot || !plan
  React.useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])

  if (gone) return null
  if (phone) {
    const { card } = slot
    return (
      <Sheet title={`${FORMAT_LABEL[card.format]} · ${card.pillar}`} onClose={onClose}>
        <div className="flex flex-col gap-7 pt-1">
          <Body key={id} slot={slot} plan={plan} />
        </div>
      </Sheet>
    )
  }
  return (
    <>
      <button
        type="button"
        aria-label="Close the brief"
        onClick={onClose}
        className="fixed inset-0 z-30"
      />
      <Detail key={id} slot={slot} plan={plan} onClose={onClose} />
    </>
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
  setStatus: (step: Step) => void
  setDate: (dayN: string) => void
  setTime: (time: string) => void
}

/**
 * Every card's plan. A date makes the idea a post on the calendar, a status sets that post's
 * stage, and a new date or time moves it. A status set before a date takes the first free day.
 * The post carries the idea's own photo only: a reference photo is somebody else's picture.
 */
function usePlans(slots: Slot[]): Record<string, Plan> {
  const { brand, weeks, byId, planPost, reschedule, setStage } = useBrand()
  const [times, setTimes] = React.useState<Record<string, string>>({})
  return React.useMemo(() => {
    const out: Record<string, Plan> = {}
    for (const slot of slots) {
      const { card, dayN } = slot
      const post = card.postId ? byId(card.postId) : undefined
      const time = post?.slot.split(', ')[1] ?? times[card.id] ?? '18:00'
      const days = daysAhead(weeks, card)
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
        const id = planPost(
          { format: card.format, hook: card.hook, image: card.image },
          d,
          t,
          stage,
        )
        editIdea(brand.id, card.id, { postId: id })
      }
      out[card.id] = {
        time,
        days,
        setStatus: (step) => plan(stageOf(step), dayN, time),
        setDate: (n) => plan(post?.stage ?? 'draft', n, time),
        setTime: (t) =>
          post && dayN
            ? reschedule(post.id, dayN, t)
            : setTimes((all) => ({ ...all, [card.id]: t })),
      }
    }
    return out
  }, [slots, brand.id, weeks, byId, planPost, reschedule, setStage, times])
}

// ── The detail pane ──────────────────────────────────────────────────────────────────────────

/** The brief as a panel at the right of a wide screen. */
function Detail({ slot, plan, onClose }: { slot: Slot; plan: Plan; onClose: () => void }) {
  const { card } = slot
  const panel = React.useRef<HTMLElement>(null)

  // The brief opens over the page, so the keyboard starts inside it.
  React.useEffect(() => panel.current?.focus(), [])

  return (
    <aside
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Idea"
      tabIndex={-1}
      className="bb-sheet fixed top-3 right-3 bottom-3 z-40 flex w-[440px] flex-col overflow-hidden rounded-[20px] bg-page shadow-sheet outline-none"
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <span className={`${EYEBROW} flex items-center gap-2`}>
          <FormatIcon format={card.format} size={11} />
          {FORMAT_LABEL[card.format]} · {card.pillar}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pt-3 pb-6">
        <Body slot={slot} plan={plan} />
      </div>
    </aside>
  )
}

/** What the brief holds, in a panel or a sheet: the words, the plan, the shots, the inspiration. */
function Body({ slot, plan }: { slot: Slot; plan: Plan }) {
  const { brand, weeks } = useBrand()
  const { card, status, dayN } = slot
  const rename = useRename(card)
  const suggested = status === 'suggested'
  const step = stepOf(status)

  return (
    <>
      <div className="flex flex-col gap-2">
        <textarea
          value={card.hook}
          rows={2}
          onChange={(e) => rename(e.target.value)}
          aria-label="Hook"
          className="w-full resize-none bg-transparent font-display text-[28px] leading-[1.08] outline-none"
        />
        <textarea
          value={card.angle}
          rows={2}
          onChange={(e) => editIdea(brand.id, card.id, { angle: e.target.value })}
          placeholder="What the shot is, in a sentence."
          aria-label="Note"
          className="w-full resize-none bg-transparent text-[14px] leading-[1.5] text-ink-2 outline-none placeholder:text-ink-5"
        />
      </div>

      {suggested ? (
        <Suggestion slot={slot} />
      ) : (
        <section aria-label="Plan" className="flex flex-col gap-3">
          <div className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 text-[13px]">
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
          <span className="pl-[68px] text-[12px] text-ink-4">
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
      )}

      <Shots card={card} />

      <References card={card} />

      <Sharpen card={card} />

      <section aria-label="Subject" className="flex flex-col gap-1.5">
        <span className={EYEBROW}>Subject</span>
        <input
          value={card.feature}
          onChange={(e) => editIdea(brand.id, card.id, { feature: e.target.value })}
          aria-label="Subject"
          className="w-full bg-transparent text-[14px] outline-none"
        />
      </section>
    </>
  )
}

/**
 * What to shoot from: the idea's own photo, the posts it grew from, then anything the team adds.
 * Drop photos or videos anywhere on the section, or press Add to browse. An added one can be
 * taken off again; the inspiration posts stay.
 */
function References({ card }: { card: IdeaCard }) {
  const { brand } = useBrand()
  const posts = inspirationOf(brand.id, card).filter((p) => p.image)
  const [ref] = posts
  // The idea's own photo may be a post's too (the demo reuses a few): one tile per photo.
  const mood = [
    ...(card.image ? [{ src: card.image, note: 'Your photo' }] : []),
    ...posts.map((p) => ({ src: p.image, note: p.borrow })),
  ].filter((m, i, a) => a.findIndex((o) => o.src === m.src) === i)
  const added = card.refs ?? []
  const [over, setOver] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  async function add(files: FileList | null) {
    const media = [...(files ?? [])].filter((f) => /^(image|video)\//.test(f.type))
    if (media.length === 0) return
    const dropped = await Promise.all(media.map(fromFile))
    editIdea(brand.id, card.id, { refs: [...added, ...dropped.map((d) => d.src)] })
  }

  return (
    <section
      aria-label="Inspiration"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void add(e.dataTransfer.files)
      }}
      className={`-m-2 flex flex-col gap-3 rounded-[14px] p-2 transition-colors ${over ? 'bg-(--cal-drop) shadow-[inset_0_0_0_1px_var(--cal-ghost)]' : ''}`}
    >
      <span className={EYEBROW}>Inspiration</span>
      <div className="grid grid-cols-3 gap-1.5">
        {mood.map((m) => (
          <span
            key={m.src}
            title={m.note}
            className="relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-tile"
          >
            <Image src={m.src} alt="" fill sizes="130px" className="object-cover" />
          </span>
        ))}
        {added.map((src) => (
          <span
            key={src}
            className="group/ref relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-tile"
          >
            <Media src={src} sizes="130px" />
            <button
              type="button"
              aria-label="Remove this reference"
              onClick={() => editIdea(brand.id, card.id, { refs: added.filter((r) => r !== src) })}
              className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-page text-ink-3 opacity-0 shadow-soft transition-opacity group-hover/ref:opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <CloseIcon />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed text-center transition-colors ${over ? 'border-ink-3 text-ink' : 'border-(--cal-ghost) text-ink-4 hover:border-(--line-strong) hover:text-ink'}`}
        >
          <PlusIcon size={12} />
          <span className="px-2 text-[11.5px] leading-tight font-medium">
            {over ? 'Drop to add' : 'Add or drop'}
          </span>
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          void add(e.target.files)
          e.target.value = ''
        }}
      />
      {ref && (
        <span className="flex flex-col gap-0.5 text-[13px]">
          <span>Borrow: {ref.borrow}</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-4">
            <PlatformLogo platform={ref.platform} size={9} />
            {ref.account}
          </span>
        </span>
      )}
    </section>
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
    <section aria-label="Suggestion" className="flex flex-col gap-3">
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
          onClick={() => skipSuggestion(brand.id, card.id)}
          className="h-10 rounded-full px-3 text-[13.5px] text-ink-3 transition-colors hover:text-ink"
        >
          Skip
        </button>
      </span>
    </section>
  )
}

/** The shot list as ticks: tap the circle when the shot is done, edit a line in place, add one. */
function Shots({ card }: { card: IdeaCard }) {
  const { brand } = useBrand()
  const [draft, setDraft] = React.useState('')
  const done = card.done ?? []

  function setShots(shots: string[], nextDone = done) {
    editIdea(brand.id, card.id, { shots, done: nextDone.filter((d) => shots.includes(d)) })
  }

  return (
    <section aria-label="Shots" className="flex flex-col">
      <span className={`${EYEBROW} flex items-center gap-2 pb-1.5`}>
        Shots
        <span className="text-ink-5 tabular-nums">
          {done.length}/{card.shots.length}
        </span>
      </span>
      <ul className="flex flex-col">
        {card.shots.map((shot, i) => {
          const on = done.includes(shot)
          return (
            <li key={i} className={`group/shot flex items-center gap-3 border-b ${HAIR} py-2`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={`Shot done: ${shot}`}
                onClick={() =>
                  editIdea(brand.id, card.id, {
                    done: on ? done.filter((d) => d !== shot) : [...done, shot],
                  })
                }
                className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${on ? 'border-(--insight-5) bg-(--insight-5) text-page' : 'border-(--line-strong) hover:border-ink-3'}`}
              >
                {on && <CheckIcon size={8} strokeWidth={2.4} />}
              </button>
              <input
                value={shot}
                onChange={(e) =>
                  setShots(
                    card.shots.map((s, j) => (j === i ? e.target.value : s)),
                    done.map((d) => (d === shot ? e.target.value : d)),
                  )
                }
                aria-label={`Shot ${i + 1}`}
                className={`min-w-0 flex-1 bg-transparent text-[14px] outline-none ${on ? 'text-ink-4 line-through' : 'text-ink'}`}
              />
              <button
                type="button"
                aria-label={`Remove shot: ${shot}`}
                onClick={() => setShots(card.shots.filter((_, j) => j !== i))}
                className="text-ink-5 opacity-0 transition-opacity group-hover/shot:opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <CloseIcon />
              </button>
            </li>
          )
        })}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          setShots([...card.shots, draft.trim()])
          setDraft('')
        }}
        className="flex items-center gap-3 py-2"
      >
        <span className="flex size-[18px] shrink-0 items-center justify-center text-ink-5">
          <PlusIcon size={10} />
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a shot"
          aria-label="Add a shot"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-5"
        />
      </form>
    </section>
  )
}

/** Three stronger hooks; picking one swaps it in, and "Back to mine" restores the team's words. */
function Sharpen({ card }: { card: IdeaCard }) {
  const use = useRename(card)
  // The hook as it was when the card opened, so "Back to mine" has somewhere to go.
  const [mine] = React.useState(card.hook)
  if (card.sharper.length === 0) return null
  const picked = card.sharper.findIndex((s) => s.text === card.hook)

  return (
    <section aria-label="Sharpen the hook" className="flex flex-col gap-2">
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
      <div role="radiogroup" aria-label="Sharper hooks" className="flex flex-col gap-1">
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

function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <span className="relative flex">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 cursor-pointer disabled:cursor-default disabled:opacity-50 appearance-none rounded-full bg-surface pr-7 pl-3 text-[12.5px] font-medium text-ink outline-none hover:bg-paper focus-visible:shadow-[0_0_0_2px_var(--ink)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
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
