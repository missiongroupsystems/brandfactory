'use client'

import Image from 'next/image'
import * as React from 'react'
import { createPortal } from 'react-dom'

import { AppHeader } from '@/components/app-header'
import { Fold, Segmented } from '@/components/controls'
import { CheckIcon, ChevronIcon, SparkIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import { usePhone } from '@/components/use-phone'
import type { Brand } from '@/data/brands'
import { INBOX_BY_BRAND, type BrandInbox, type InboxMessage } from '@/data/inbox'
import { useBrand } from '@/features/schedule/posts-store'

import { markDone, sendTo, useInbox } from './inbox-store'
import { ago, draftAt, firstName, nextAfter, queue, whereFrom, type InboxFilter } from './model'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
/** How long a replied row takes to tick, slide and fold away before it leaves the store. */
const LEAVE_MS = 620
/** How long Regenerate "thinks" before the next draft shows. */
const THINK_MS = 700

/**
 * The inbox: every comment, mention and DM on the brand's Instagram, TikTok and Facebook that
 * needs a reply, in one list, complaints first. Opening one shows it in context with a reply the
 * AI drafted in the brand's voice; Send clears it with a tick and a fold, and the next one opens.
 * A complaint can go to a named person. Noise is folded away at the end. On a phone the list
 * comes first and a message opens full screen.
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

  return (
    <main className="bb-swap mx-auto flex w-full max-w-[1120px] flex-col px-10 pb-24 max-md:px-4">
      <div className="flex items-end justify-between gap-6 pt-6 pb-8 max-md:flex-col max-md:items-stretch max-md:gap-5 max-md:pt-2 max-md:pb-6">
        <div className="flex flex-col gap-3">
          <span className={EYEBROW}>{brand.name} · Instagram, TikTok, Facebook</span>
          <h1 className="font-display text-[56px] leading-none tracking-[-0.035em] max-md:text-[34px]">
            Inbox
          </h1>
          <p className="text-[15px] text-ink-3" aria-live="polite">
            {waiting.length === 0
              ? 'Nothing waiting for a reply.'
              : `${waiting.length} waiting for a reply${
                  waiting.some((m) => m.tone === 'complaint')
                    ? `, ${plural(waiting.filter((m) => m.tone === 'complaint').length, 'complaint')} first`
                    : ''
                }.`}
          </p>
        </div>
        <div className="w-[300px] max-md:w-full">
          <Segmented
            label="Show"
            pill
            value={filter}
            onChange={(f) => {
              setFilter(f)
              setSelected(null)
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'comments', label: 'Comments' },
              { value: 'dms', label: 'DMs' },
            ]}
          />
        </div>
      </div>

      {caughtUp ? (
        <div className="flex flex-col items-center">
          <CaughtUp filter={filter} />
          {noise.length > 0 && (
            <div className="w-full max-w-[420px]">
              <Noise brandId={brand.id} noise={noise} />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[360px_minmax(0,1fr)] items-start gap-12 max-lg:grid-cols-[320px_minmax(0,1fr)] max-lg:gap-8 max-md:grid-cols-1">
          <div className="flex flex-col">
            {complaints.length > 0 && (
              <>
                <span className={`${EYEBROW} px-3 pb-2`}>Complaints</span>
                {complaints.map(row)}
              </>
            )}
            {rest.length > 0 && (
              <>
                <span className={`${EYEBROW} px-3 pb-2 ${complaints.length ? 'pt-6' : ''}`}>
                  To reply
                </span>
                {rest.map(row)}
              </>
            )}
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
              <div className="sticky top-6">
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
    <div className="bb-sheet fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-page px-4 pt-3 pb-[calc(32px+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 mb-3 flex h-10 items-center gap-1.5 text-[15px] text-ink-2"
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
  sentTo?: string
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
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[14px] font-medium">{m.from.name}</span>
              <span className="ml-auto shrink-0 text-[12px] text-ink-4 tabular-nums">
                {ago(m.minutes)}
              </span>
            </span>
            <span className="line-clamp-2 text-[13px] leading-[1.4] text-ink-2">{m.text}</span>
            {m.tone === 'complaint' && <ComplaintTag sentTo={sentTo} />}
          </span>
        </button>
      </div>
    </div>
  )
}

function ComplaintTag({ sentTo }: { sentTo?: string }) {
  return sentTo ? (
    <span className="mt-0.5 inline-flex items-center gap-1 self-start text-[12px] text-ink-3">
      <CheckIcon size={10} />
      Sent to {firstName(sentTo)}
    </span>
  ) : (
    <span className="mt-0.5 inline-flex items-center gap-1.5 self-start text-[12px] font-medium text-fail-ink">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-fail" />
      Complaint
    </span>
  )
}

/** What needs no reply, folded shut at the end of the list: open it to check, or clear it all. */
function Noise({ brandId, noise }: { brandId: Brand['id']; noise: InboxMessage[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mt-6 border-t border-(--cal-line) pt-3">
      <div className="flex items-center gap-3 px-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 flex-1 items-center gap-2 text-left text-[13px] text-ink-3 transition-colors hover:text-ink"
        >
          {noise.length} more, no reply needed
          <span className="text-ink-5">· emoji, spam, tags</span>
          <ChevronIcon open={open} />
        </button>
        <button
          type="button"
          onClick={() =>
            markDone(
              brandId,
              noise.map((m) => m.id),
            )
          }
          className="h-9 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Clear
        </button>
      </div>
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
  sentTo?: string
  onSend: () => void
}) {
  const [n, setN] = React.useState(0)
  const [text, setText] = React.useState(() => draftAt(m, 0))
  const [thinking, setThinking] = React.useState(false)

  function regenerate() {
    setThinking(true)
    window.setTimeout(() => {
      setN(n + 1)
      setText(draftAt(m, n + 1))
      setThinking(false)
    }, THINK_MS)
  }

  return (
    <article aria-label={`${m.from.name}, ${whereFrom(m)}`} className="bb-swap flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Avatar m={m} size={44} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[16px] font-medium">{m.from.name}</span>
          <span className="truncate text-[13px] text-ink-4">
            {m.from.handle.startsWith('@') ? `${m.from.handle} · ` : ''}
            {whereFrom(m)} · {ago(m.minutes)}
          </span>
        </div>
      </header>

      {m.tone === 'complaint' && (
        <SendTo brandId={brand.id} m={m} people={data.people} sentTo={routedTo} />
      )}

      <div className="flex flex-col gap-3">
        {m.post && (
          <div className="flex items-center gap-3">
            <span className="relative h-[60px] w-12 shrink-0 overflow-hidden rounded-[8px] bg-tile">
              <Image src={m.post.image} alt="" fill sizes="96px" className="object-cover" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12px] text-ink-4">
                {m.kind === 'mention' ? `Their post, tagging ${brand.handle}` : 'On your post'}
              </span>
              <span className="line-clamp-2 text-[13px] text-ink-2">{m.post.caption}</span>
            </span>
          </div>
        )}
        {m.earlier?.map((e, i) => (
          <Bubble key={i} ours={e.from === 'us'} text={e.text} />
        ))}
        <Bubble text={m.text} />
      </div>

      <div className="flex flex-col rounded-[18px] border border-line bg-page shadow-soft focus-within:border-line-strong">
        <label htmlFor={`reply-${m.id}`} className="sr-only">
          Reply to {m.from.name}
        </label>
        <textarea
          id={`reply-${m.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={thinking}
          rows={4}
          className={`field-sizing-content min-h-[112px] resize-none rounded-t-[18px] bg-transparent px-4 pt-4 pb-2 text-[15px] leading-[1.5] outline-none ${thinking ? 'bb-pulse' : ''}`}
        />
        <div className="flex flex-wrap items-center gap-3 px-4 pt-1 pb-3">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-ink-4 max-md:basis-full">
            <span className="shrink-0 text-(--insight)">
              <SparkIcon size={10} />
            </span>
            <span>
              Drafted in {brand.name}&rsquo;s tone of voice: {data.voice}
            </span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={regenerate}
              disabled={thinking}
              className="bb-press h-9 rounded-full px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
            >
              {thinking ? 'Writing…' : 'Regenerate'}
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={thinking || !text.trim()}
              className="bb-press h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-page disabled:opacity-40"
            >
              Send reply
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function Bubble({ text, ours = false }: { text: string; ours?: boolean }) {
  return (
    <p
      className={`max-w-[88%] rounded-[18px] px-4 py-2.5 text-[15px] leading-[1.45] ${ours ? 'self-end bg-ink text-page' : 'self-start bg-surface'}`}
    >
      {text}
    </p>
  )
}

/**
 * A complaint goes to the person who can fix it, in one tap: the suggested person, or another
 * from the menu. They get an alert (simulated), and the message says who has it.
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
  sentTo?: string
}) {
  const [menu, setMenu] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const first = people.find((p) => p.name === m.sendTo) ?? people[0]!

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
    const person = people.find((p) => p.name === routedTo)
    return (
      <div className="bb-rise flex items-center gap-3 rounded-[14px] bg-surface px-4 py-3">
        <span className="bb-pop flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-page">
          <CheckIcon size={10} strokeWidth={2} />
        </span>
        <span className="text-[13px] text-ink-2">
          <span className="font-medium text-ink">Sent to {routedTo}</span>
          {person ? `, ${person.role.charAt(0).toLowerCase()}${person.role.slice(1)}` : ''}.{' '}
          {firstName(routedTo)} got an alert just now.
        </span>
      </div>
    )
  }

  return (
    <div
      ref={root}
      className="flex flex-wrap items-center gap-3 rounded-[14px] border border-(--fail-line) bg-(--fail-soft) px-4 py-3"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-fail-ink">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-fail" />
        <span>
          <span className="font-medium">Complaint.</span> Send it to whoever can fix it.
        </span>
      </span>
      <div className="relative ml-auto flex items-center rounded-full bg-page shadow-soft">
        <button
          type="button"
          onClick={() => sendTo(brandId, m.id, first.name)}
          className="h-8 rounded-l-full pr-2 pl-3.5 text-[13px] font-medium"
        >
          Send to {firstName(first.name)}
        </button>
        <button
          type="button"
          aria-label="Send to someone else"
          aria-expanded={menu}
          onClick={() => setMenu((o) => !o)}
          className="flex h-8 items-center rounded-r-full border-l border-line pr-3 pl-2 text-ink-3"
        >
          <ChevronIcon open={menu} />
        </button>
        {menu && (
          <div
            role="menu"
            className="bb-menu absolute top-full right-0 z-20 mt-2 flex w-[260px] flex-col rounded-[14px] bg-page p-1.5 shadow-pop"
          >
            {people.map((p) => (
              <button
                key={p.name}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false)
                  sendTo(brandId, m.id, p.name)
                }}
                className="flex flex-col rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-surface"
              >
                <span className="text-[13px] font-medium">{p.name}</span>
                <span className="text-[12px] text-ink-4">{p.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
