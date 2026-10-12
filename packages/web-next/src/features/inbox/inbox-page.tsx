'use client'

import Image from 'next/image'
import * as React from 'react'
import { createPortal } from 'react-dom'

import { AppHeader } from '@/components/app-header'
import { Fold } from '@/components/controls'
import { CheckIcon, ChevronIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import { usePhone } from '@/components/use-phone'
import type { Brand } from '@/data/brands'
import { INBOX_BY_BRAND, type BrandInbox, type InboxEarlier, type InboxMessage } from '@/data/inbox'
import { useBrandKit } from '@/features/brand/brand-store'
import { useBrand } from '@/features/schedule/posts-store'

import { markDone, sendTo, useInbox } from './inbox-store'
import {
  ago,
  conversation,
  firstName,
  firstNames,
  nextAfter,
  queue,
  stamps,
  whereFrom,
  type InboxFilter,
} from './model'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
/** How long a replied row takes to tick, slide and fold away before it leaves the store. */
const LEAVE_MS = 620
/** How long a picked direction takes to write its reply. */
const WRITE_MS = 750

const FILTERS: ReadonlyArray<{ value: InboxFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'comments', label: 'Comments' },
  { value: 'dms', label: 'DMs' },
]

/**
 * The inbox: every comment, mention and DM on the brand's Instagram, TikTok and Facebook that
 * needs a reply, in one list, complaints first. Opening one shows it in context with three
 * directions a reply can take; picking one writes the reply in the brand's voice, and Send clears
 * the message with a tick and a fold, so the next one opens. One action on the screen: reply.
 * A complaint can still go to a named person, from the thread's menu. Noise is folded away at
 * the end. On a phone the list comes first and a message opens full screen.
 */
export function InboxPage() {
  const { brand } = useBrand()
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      {/* A brand switch starts the page over: its own messages, nothing selected. */}
      <Inbox key={brand.id} brand={brand} data={INBOX_BY_BRAND[brand.id]} />
    </div>
  )
}

function Inbox({ brand, data }: { brand: Brand; data: BrandInbox }) {
  const phone = usePhone()
  const { done, sentTo: routed } = useInbox(brand.id)
  const [filter, setFilter] = React.useState<InboxFilter>('all')
  const [selected, setSelected] = React.useState<string | null>(null)
  const [leaving, setLeaving] = React.useState<ReadonlySet<string>>(new Set())
  const { open, noise } = queue(data.messages, done, filter)
  const staying = open.filter((m) => !leaving.has(m.id))
  // A desktop always shows a message beside the list; a phone shows one only when it is tapped.
  const current = staying.find((m) => m.id === selected) ?? (phone ? null : (staying[0] ?? null))
  const complaints = open.filter((m) => m.tone === 'complaint')
  const rest = open.filter((m) => m.tone !== 'complaint')
  const waiting = queue(data.messages, done).open.filter((m) => !leaving.has(m.id))
  const caughtUp = staying.length === 0

  function send(id: string) {
    setLeaving((s) => new Set(s).add(id))
    // On a phone the list comes back, so the reply is seen to leave it.
    setSelected(phone ? null : nextAfter(staying, id))
    window.setTimeout(() => {
      markDone(brand.id, [id])
      setLeaving((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }, LEAVE_MS)
  }

  const row = (m: InboxMessage) => (
    <Row
      key={m.id}
      m={m}
      current={current?.id === m.id}
      leaving={leaving.has(m.id)}
      sentTo={routed[m.id]}
      onOpen={() => setSelected(m.id)}
    />
  )

  // Small text tabs at the top of the list: a way to see only the DMs, not a control of its own.
  const tabs = (
    <div role="group" aria-label="Show" className="flex gap-4 px-3 pb-3">
      {FILTERS.map((f) => {
        const on = f.value === filter
        return (
          <button
            key={f.value}
            type="button"
            aria-pressed={on}
            onClick={() => {
              setFilter(f.value)
              setSelected(null)
            }}
            className={`h-7 text-[12.5px] transition-colors ${on ? 'font-medium text-ink' : 'text-ink-4 hover:text-ink'}`}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <main className="bb-swap mx-auto flex w-full max-w-[1120px] flex-col px-10 pb-24 max-md:px-4">
      <div className="flex flex-col gap-3 pt-6 pb-8 max-md:pt-2 max-md:pb-6">
        <span className={EYEBROW}>{brand.name}</span>
        <h1 className="font-display text-[56px] leading-none tracking-[-0.035em] max-md:text-[34px]">
          Inbox
        </h1>
        <p className="text-[15px] text-ink-3" aria-live="polite">
          {waiting.length === 0 ? 'Nothing to reply to.' : `${waiting.length} to reply to`}
        </p>
      </div>

      {caughtUp ? (
        <div className="flex flex-col">
          {/* Only once something is left to see another way: the end of the inbox needs no tabs. */}
          {(waiting.length > 0 || filter !== 'all') && tabs}
          <div className="flex flex-col items-center">
            <CaughtUp filter={filter} />
            {noise.length > 0 && (
              <div className="w-full max-w-[420px]">
                <Noise brandId={brand.id} noise={noise} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[360px_minmax(0,1fr)] items-start gap-12 max-lg:grid-cols-[320px_minmax(0,1fr)] max-lg:gap-8 max-md:grid-cols-1">
          <div className="flex flex-col">
            {tabs}
            {/* Complaints first, marked by a dot: no headings to read. */}
            {complaints.map(row)}
            {rest.map(row)}
            {noise.length > 0 && <Noise brandId={brand.id} noise={noise} />}
          </div>
          {/* The open message: beside the list on a desktop, over it on a phone. */}
          {current &&
            (phone ? (
              <FullScreen onBack={() => setSelected(null)}>
                <Thread
                  key={current.id}
                  m={current}
                  brand={brand}
                  data={data}
                  sentTo={routed[current.id]}
                  onSend={() => send(current.id)}
                />
              </FullScreen>
            ) : (
              // A panel of its own height: the thread scrolls inside it, and the reply stays in view.
              <div className="sticky top-6 flex h-[max(440px,calc(100svh-280px))] flex-col rounded-[20px] border border-line bg-page">
                <Thread
                  key={current.id}
                  m={current}
                  brand={brand}
                  data={data}
                  sentTo={routed[current.id]}
                  onSend={() => send(current.id)}
                />
              </div>
            ))}
        </div>
      )}
    </main>
  )
}

/**
 * A phone's open message, over the whole screen and the tab bar. Under the body, as the sheet is:
 * the page's own entrance motion would otherwise hold it inside the page.
 */
function FullScreen({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])
  return createPortal(
    <div className="bb-sheet fixed inset-0 z-40 flex flex-col bg-page pt-[env(safe-area-inset-top)]">
      <button
        type="button"
        onClick={onBack}
        className="mx-3 flex h-11 shrink-0 items-center gap-1.5 self-start text-[15px] text-ink-2"
      >
        <span className="rotate-90">
          <ChevronIcon size={12} />
        </span>
        Inbox
      </button>
      {children}
    </div>,
    document.body,
  )
}

// ── The list ─────────────────────────────────────────────────────────────────────────────────

function Avatar({ m, size = 36 }: { m: InboxMessage; size?: number }) {
  const initials = m.from.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        aria-hidden="true"
        className="flex size-full items-center justify-center rounded-full bg-tile text-[12px] font-semibold text-ink-2"
      >
        {initials}
      </span>
      <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-page text-ink shadow-soft">
        <PlatformLogo platform={m.platform} size={9} />
      </span>
    </span>
  )
}

/**
 * One message in the list. A replied one ticks, slides off and folds shut, so the list closes up
 * under the user's eye instead of jumping.
 */
function Row({
  m,
  current,
  leaving,
  sentTo,
  onOpen,
}: {
  m: InboxMessage
  current: boolean
  leaving: boolean
  sentTo?: string[]
  onOpen: () => void
}) {
  return (
    <div
      className="bb-fold"
      style={{
        gridTemplateRows: leaving ? '0fr' : '1fr',
        opacity: leaving ? 0 : 1,
        transitionDelay: leaving ? '220ms' : undefined,
      }}
    >
      <div>
        <button
          type="button"
          onClick={onOpen}
          disabled={leaving}
          aria-current={current ? 'true' : undefined}
          className={`flex w-full gap-3 rounded-[14px] px-3 py-3 text-left transition-[background-color,transform] duration-[360ms] ease-[cubic-bezier(.2,.8,.2,1)] ${current ? 'bg-surface' : 'hover:bg-surface-2'}`}
          style={{ transform: leaving ? 'translateX(14px)' : undefined }}
        >
          {leaving ? (
            <span className="bb-pop flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-page">
              <CheckIcon size={13} strokeWidth={2} />
            </span>
          ) : (
            <Avatar m={m} />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="truncate text-[14px] font-medium">{m.from.name}</span>
              {m.tone === 'complaint' && <ComplaintMark sentTo={sentTo} />}
              <span className="ml-auto shrink-0 text-[12px] text-ink-4 tabular-nums">
                {ago(m.minutes)}
              </span>
            </span>
            <span className="truncate text-[13px] text-ink-3">{m.text}</span>
          </span>
        </button>
      </div>
    </div>
  )
}

/** A complaint is a small dot by the name; once it has gone to someone, a quiet tick. */
function ComplaintMark({ sentTo }: { sentTo?: string[] }) {
  return sentTo ? (
    <span
      title={`Sent to ${sentTo.join(', ')}`}
      aria-label={`Complaint, sent to ${firstNames(sentTo)}`}
      className="flex shrink-0 text-ink-4"
    >
      <CheckIcon size={10} />
    </span>
  ) : (
    <span
      title="Complaint"
      aria-label="Complaint"
      className="size-1.5 shrink-0 rounded-full bg-fail"
    />
  )
}

/**
 * What needs no reply (emoji, spam, a tagged friend), folded shut at the end of the list: their
 * faces, faded and stacked, and one word. Open it to check, and clear it from inside.
 */
function Noise({ brandId, noise }: { brandId: Brand['id']; noise: InboxMessage[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mt-6 border-t border-(--cal-line) pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Muted, ${noise.length} need no reply`}
        onClick={() => setOpen((o) => !o)}
        className="group flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] text-ink-4 transition-colors hover:text-ink"
      >
        <span
          aria-hidden="true"
          className="flex opacity-60 grayscale transition-opacity group-hover:opacity-100"
        >
          {noise.slice(0, 5).map((m, i) => (
            <span
              key={m.id}
              className={`flex size-5 items-center justify-center rounded-full bg-tile text-[8.5px] font-semibold text-ink-3 shadow-[0_0_0_1.5px_var(--page)] ${i > 0 ? '-ml-1.5' : ''}`}
            >
              {m.from.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </span>
        Muted
        <ChevronIcon open={open} />
      </button>
      <Fold open={open}>
        <ul className="flex flex-col pt-1">
          {noise.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-[13px] text-ink-3">
              <Avatar m={m} size={28} />
              <span className="shrink-0 text-ink-2">{m.from.handle}</span>
              <span className="truncate">{m.text}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            markDone(
              brandId,
              noise.map((m) => m.id),
            )
          }
          className="mt-1 flex h-9 items-center px-3 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Clear
        </button>
      </Fold>
    </div>
  )
}

function CaughtUp({ filter }: { filter: InboxFilter }) {
  const what = filter === 'dms' ? 'DMs' : filter === 'comments' ? 'comments' : 'messages'
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <span className="bb-ring flex size-16 items-center justify-center rounded-full bg-surface">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <path
            className="bb-draw"
            d="M6 13.5L11 18.5L20 8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <h2 className="font-display text-[28px] leading-none tracking-[-0.03em]">All caught up</h2>
      <p className="max-w-[320px] text-[14px] text-ink-3">
        {filter === 'all'
          ? 'Every comment, tag and DM has its reply.'
          : `No ${what} waiting for a reply.`}
      </p>
    </div>
  )
}

// ── The open message ─────────────────────────────────────────────────────────────────────────

function Thread({
  m,
  brand,
  data,
  sentTo: routedTo,
  onSend,
}: {
  m: InboxMessage
  brand: Brand
  data: BrandInbox
  sentTo?: string[]
  onSend: () => void
}) {
  const { summary: voice } = useBrandKit(brand.id).voice
  const [picked, setPicked] = React.useState<number | null>(null)
  const [text, setText] = React.useState('')
  const [writing, setWriting] = React.useState(false)
  // Which pick is being written: a second pick while the first writes makes the first stand down.
  const job = React.useRef(0)
  const scroller = React.useRef<HTMLDivElement>(null)
  const items = conversation(m)
  const marks = stamps(items)

  // A long thread opens at its latest message, the one the reply answers.
  React.useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  /** A direction is picked: the AI writes its reply (simulated) into the box, over any edit. */
  function pick(i: number) {
    const id = ++job.current
    setPicked(i)
    setWriting(true)
    window.setTimeout(() => {
      if (job.current !== id) return
      setText(m.replies[i]!.text)
      setWriting(false)
    }, WRITE_MS)
  }

  // Messages from the same side with no time between them sit together as one group.
  const together = (a: number, b: number) =>
    items[a] !== undefined && items[b] !== undefined && items[a].from === items[b].from && !marks[b]

  return (
    <article
      aria-label={`${m.from.name}, ${whereFrom(m)}`}
      className="bb-swap flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-3.5 max-md:px-4 max-md:pt-1 max-md:pb-3">
        <Avatar m={m} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-medium">{m.from.name}</span>
          <span className="truncate text-[12.5px] text-ink-4">{whereFrom(m)}</span>
        </div>
        {m.tone === 'complaint' && (
          <SendTo brandId={brand.id} m={m} people={data.people} sentTo={routedTo} />
        )}
      </header>

      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      >
        <ol
          aria-label="Conversation"
          className="mx-auto mt-auto flex w-full max-w-[600px] flex-col px-6 pt-6 pb-4 max-md:px-4"
        >
          {m.post && (
            <li className="mb-6 flex max-w-full items-center gap-3 self-start rounded-[12px] bg-surface-2 p-1.5 pr-4">
              <span className="relative h-10 w-8 shrink-0 overflow-hidden rounded-[7px] bg-tile">
                <Image src={m.post.image} alt="" fill sizes="64px" className="object-cover" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[11.5px] text-ink-4">
                  {m.kind === 'mention' ? 'Their post' : 'Your post'}
                </span>
                <span className="truncate text-[13px] text-ink-3">{m.post.caption}</span>
              </span>
            </li>
          )}
          {items.map((e, i) => (
            <li
              key={i}
              className={`flex flex-col ${i === 0 ? '' : together(i - 1, i) ? 'mt-1' : 'mt-3'}`}
            >
              {marks[i] && (
                <time
                  className={`self-center pb-3 text-[11.5px] text-ink-4 ${i === 0 ? '' : 'pt-4'}`}
                >
                  {marks[i]}
                </time>
              )}
              <Bubble item={e} tail={!together(i, i + 1)} />
            </li>
          ))}
        </ol>
      </div>

      <div className="shrink-0 px-6 pt-1 pb-5 max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-[552px] flex-col gap-2.5">
          {/* Three ways to reply, as a dialogue gives them. The pick writes the reply below. */}
          <div role="group" aria-label="Reply" className="flex flex-wrap gap-1.5">
            {m.replies.map((r, i) => {
              const on = picked === i
              return (
                <button
                  key={r.direction}
                  type="button"
                  aria-pressed={on}
                  title={`Written in ${brand.name}’s voice: ${voice}`}
                  onClick={() => pick(i)}
                  className={`bb-press h-8 rounded-full px-3 text-[13px] transition-colors ${on ? 'bg-page text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]' : 'bg-surface text-ink-2 hover:bg-tile hover:text-ink'}`}
                >
                  {r.direction}
                </button>
              )
            })}
          </div>
          <div className="flex flex-col rounded-[18px] border border-line bg-page transition-colors focus-within:border-line-strong">
            <label htmlFor={`reply-${m.id}`} className="sr-only">
              Reply to {m.from.name}
            </label>
            {writing ? (
              <span
                role="status"
                aria-label="Writing"
                className="flex min-h-[64px] items-center gap-1 px-4 pt-3.5 pb-1"
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="bb-pulse size-1.5 rounded-full bg-ink-4"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </span>
            ) : (
              <textarea
                key={picked ?? 'own'}
                id={`reply-${m.id}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Or write your own"
                rows={2}
                className={`field-sizing-content max-h-[214px] min-h-[64px] resize-none bg-transparent px-4 pt-3.5 pb-1 text-[14.5px] leading-[1.5] outline-none placeholder:text-ink-5 max-md:max-h-[162px] ${picked === null ? '' : 'bb-rise'}`}
              />
            )}
            <div className="flex justify-end py-2 pr-2">
              <button
                type="button"
                onClick={onSend}
                disabled={writing || !text.trim()}
                className="bb-press h-8 shrink-0 rounded-full bg-ink px-3.5 text-[13px] font-medium text-page disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

/**
 * One message in the thread. The guest's sit left and the brand's right; the last of a group
 * keeps a tail corner. A teammate's note sits apart, dashed, and says the guest never sees it.
 */
function Bubble({ item, tail }: { item: InboxEarlier; tail: boolean }) {
  if (item.from === 'note') {
    return (
      <div className="flex max-w-[82%] flex-col gap-0.5 self-center rounded-[14px] border border-dashed border-line-strong px-3.5 py-2.5 text-center">
        <span className="text-[11.5px] text-ink-4">
          {firstName(item.by ?? '')} · only the team sees this
        </span>
        <p className="text-[13.5px] leading-[1.45] text-ink-2">{item.text}</p>
      </div>
    )
  }
  const ours = item.from === 'us'
  const side = ours
    ? `self-end bg-ink text-page ${tail ? 'rounded-br-[6px]' : ''}`
    : `self-start bg-surface ${tail ? 'rounded-bl-[6px]' : ''}`
  return (
    <p className={`max-w-[80%] rounded-[18px] px-3.5 py-2 text-[14.5px] leading-[1.45] ${side}`}>
      {item.text}
    </p>
  )
}

/**
 * A complaint can go to the person who can fix it, from the thread's menu: an edge case beside
 * the reply, so it stays behind three dots. The menu starts from the suggested person and can
 * pick more (the chef and the venue manager). Each gets an alert (simulated), and the message
 * says who has it.
 */
function SendTo({
  brandId,
  m,
  people,
  sentTo: routedTo,
}: {
  brandId: Brand['id']
  m: InboxMessage
  people: BrandInbox['people']
  sentTo?: string[]
}) {
  const first = people.find((p) => p.name === m.sendTo) ?? people[0]!
  const [menu, setMenu] = React.useState(false)
  const [picked, setPicked] = React.useState<string[]>([first.name])
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!menu) return
    const onPointer = (e: PointerEvent) =>
      root.current?.contains(e.target as Node) || setMenu(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (routedTo) {
    const who = routedTo.map((n) => {
      const person = people.find((p) => p.name === n)
      return person ? `${n}, ${person.role}` : n
    })
    return (
      <span
        title={`${who.join('; ')}: got an alert`}
        className="bb-rise flex h-8 shrink-0 items-center gap-1.5 text-[13px] text-ink-3"
      >
        <span className="bb-pop flex">
          <CheckIcon size={11} strokeWidth={2} />
        </span>
        Sent to {firstNames(routedTo)}
      </span>
    )
  }

  const toggle = (name: string) =>
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))
  // In the brand's order, so "Giulia and Marco" reads the same whichever was ticked first.
  const chosen = people.map((p) => p.name).filter((n) => picked.includes(n))

  return (
    <div ref={root} className="relative -mr-1.5 shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label="More"
        onClick={() => setMenu((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink ${menu ? 'bg-surface text-ink' : ''}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor">
          <circle cx="2.5" cy="7" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="11.5" cy="7" r="1.3" />
        </svg>
      </button>
      {menu && (
        <div
          role="group"
          aria-label="Send to"
          className="bb-menu absolute top-10 right-0 z-20 flex w-[268px] origin-top-right flex-col rounded-[14px] bg-page p-1.5 shadow-pop"
        >
          <span className="px-3 pt-1.5 pb-2 text-[12px] text-ink-4">Send this complaint to</span>
          {people.map((p) => {
            const on = picked.includes(p.name)
            return (
              <button
                key={p.name}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(p.name)}
                className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-surface"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] font-medium">{p.name}</span>
                  <span className="text-[12px] text-ink-4">{p.role}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`flex size-[18px] shrink-0 items-center justify-center rounded-full transition-colors ${on ? 'bg-ink text-page' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]'}`}
                >
                  {on && <CheckIcon size={9} strokeWidth={2.4} />}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => {
              setMenu(false)
              sendTo(brandId, m.id, chosen)
            }}
            className="bb-press mt-1 h-9 rounded-[10px] bg-ink text-[13px] font-medium text-page transition-opacity disabled:opacity-30"
          >
            {chosen.length === 1 ? `Send to ${firstName(chosen[0]!)}` : `Send to ${chosen.length}`}
          </button>
        </div>
      )}
    </div>
  )
}
