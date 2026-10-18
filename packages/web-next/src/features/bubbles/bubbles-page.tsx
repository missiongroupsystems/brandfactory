'use client'

import * as React from 'react'

import { AppHeader } from '@/components/app-header'

import { useBrand } from '@/features/schedule/posts-store'

import { ask, decide, resetChat, retry, send, setBrand, stop, useChat } from './chat-store'
import { BUBBLES_URL, doing, moveName, running, summarise, type Turn } from './client'
import { Markdown } from './markdown'

const SUGGESTIONS = [
  "What's going out this week?",
  'Draft 3 post ideas for Friday',
  'Any comments waiting?',
]

const COLUMN = 'mx-auto w-full max-w-[720px] px-10 max-md:px-4'

/**
 * A chat with Bubbles, the team's assistant, who works in brand base through its moves. One
 * input; each question and its answer in the transcript; a line for what Bubbles is doing now;
 * and a card to say yes before anything goes out.
 */
export function BubblesPage() {
  return (
    <div className="flex min-h-svh flex-col">
      {/* A long chat scrolls; the header, with the brand Bubbles works on, stays in view. */}
      <div className="sticky top-0 z-20 bg-page">
        <AppHeader />
      </div>
      {BUBBLES_URL ? <Chat /> : <NotConnected />}
    </div>
  )
}

function NotConnected() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-32 text-center">
      <h1 className="bb-rise font-display text-[56px] leading-none tracking-[-0.035em] max-md:text-[34px]">
        Bubbles
      </h1>
      <p className="bb-rise text-[15px] text-ink-3" style={{ animationDelay: '120ms' }}>
        Bubbles is not connected.
      </p>
    </main>
  )
}

function Chat() {
  const { turns } = useChat()
  const brandId = useBrand().brand.id
  React.useEffect(() => setBrand(brandId), [brandId])
  const live = turns.some(running)
  const last = turns[turns.length - 1]

  // The newest words stay in view while an answer comes in; a page that fits does not move.
  const end = React.useRef<HTMLDivElement>(null)
  const length = last?.texts.join('').length ?? 0
  React.useEffect(() => {
    if (last) end.current?.scrollIntoView({ block: 'nearest' })
  }, [last, length])

  if (turns.length === 0) {
    return (
      <main className="flex flex-1 flex-col">
        <div
          className={`${COLUMN} bb-rise flex flex-1 flex-col items-center justify-center gap-7 pb-28`}
        >
          <h1 className="font-display text-[34px] leading-none tracking-[-0.03em] max-md:text-[28px]">
            Hi, I&rsquo;m Bubbles.
          </h1>
          <Composer live={false} onSend={(q) => void ask(q)} onStop={stop} />
          <ul className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => void ask(s)}
                  className="bb-press h-9 rounded-full border border-line px-3.5 text-[13.5px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className={COLUMN}>
        <div className="flex justify-end pt-1 pb-4">
          <button
            type="button"
            onClick={resetChat}
            className="h-8 rounded-full px-2.5 text-[13px] text-ink-4 transition-colors hover:text-ink"
          >
            New chat
          </button>
        </div>
        <ol className="flex flex-col gap-8">
          {turns.map((turn, i) => (
            <TurnRow key={turn.id} turn={turn} last={i === turns.length - 1} anyLive={live} />
          ))}
        </ol>
        {/* Scrolled to under the composer and, on a phone, the tab bar. */}
        <div ref={end} aria-hidden="true" className="scroll-mb-[112px] max-md:scroll-mb-[160px]" />
      </div>
      <div className="sticky bottom-0 mt-auto bg-page pt-4 pb-6 max-md:bottom-[calc(64px+env(safe-area-inset-bottom))] max-md:pb-3">
        <div className={COLUMN}>
          <Composer live={live} onSend={(q) => void ask(q)} onStop={stop} />
        </div>
      </div>
    </main>
  )
}

function TurnRow({
  turn,
  last,
  anyLive,
}: {
  turn: Turn
  /** Only the last turn can be asked again: a retry in the middle would reorder the chat. */
  last: boolean
  /** Some turn is on its way: a yes must wait for it. */
  anyLive: boolean
}) {
  const live = running(turn)
  const elapsed = useElapsed(live, turn.startedAt)
  const pending = [...turn.tools].reverse().find((t) => t.ok === null)
  const line =
    turn.status === 'starting'
      ? 'Starting'
      : pending
        ? doing(pending.tool)
        : turn.texts.length
          ? 'Writing'
          : 'Thinking'
  const again = last && (turn.status === 'failed' || turn.status === 'stopped')
  return (
    <li className="bb-rise flex flex-col gap-5">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-surface px-4 py-2.5 text-[15px] leading-[1.5] whitespace-pre-wrap">
          {turn.question}
        </p>
      </div>
      <div className="flex flex-col gap-3 text-[15px] leading-[1.6]">
        {turn.texts.length > 0 && <Markdown text={turn.texts.join('\n\n')} />}
        {live && (
          <p role="status" className="bb-pulse text-[13px] text-ink-4">
            {line}…{elapsed >= 5 && ` · ${elapsed}s`}
          </p>
        )}
        {turn.approval && <ApprovalCard id={turn.id} approval={turn.approval} wait={anyLive} />}
        {turn.error && <p className="text-[13.5px] text-fail-ink">{turn.error.message}</p>}
        {turn.status === 'stopped' && <p className="text-[13px] text-ink-4">Stopped.</p>}
        {again && (
          <button
            type="button"
            onClick={() => void retry(turn.id)}
            className="bb-press h-8 w-fit rounded-full border border-line px-3 text-[13px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            Try again
          </button>
        )}
        {!live && turn.tools.length > 0 && <Steps tools={turn.tools} />}
      </div>
    </li>
  )
}

/** Seconds since the turn began, while it runs. */
function useElapsed(live: boolean, startedAt: number): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live])
  return live ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
}

function Steps({ tools }: { tools: Turn['tools'] }) {
  return (
    <details className="text-[12.5px] text-ink-4">
      <summary className="w-fit cursor-pointer list-none transition-colors select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        How Bubbles did this ›
      </summary>
      <ol className="mt-2 flex flex-col gap-1">
        {tools.map((t) => (
          <li key={t.id} className="flex flex-wrap gap-x-2">
            <span>{doing(t.tool)}</span>
            <span className="font-mono text-[11.5px] text-ink-5">{t.tool}</span>
            {t.ok === false && (
              <span className="text-fail-ink">{t.refusal?.message ?? 'The core said no.'}</span>
            )}
          </li>
        ))}
      </ol>
    </details>
  )
}

/** What Bubbles wants to send, and the person's yes or not now. */
function ApprovalCard({
  id,
  approval,
  wait,
}: {
  id: string
  approval: NonNullable<Turn['approval']>
  /** A turn is still on its way: Send waits, or "go ahead" could not follow the yes. */
  wait: boolean
}) {
  const [sending, setSending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const busy = sending || wait
  const rows = summarise(approval.payload)
  const yes = async () => {
    setSending(true)
    setProblem(await send(id))
    setSending(false)
  }
  return (
    <div
      role="group"
      aria-label={moveName(approval.tool)}
      className="flex flex-col gap-3 rounded-[16px] border border-line p-4"
    >
      <span className="text-[13px] font-medium">{moveName(approval.tool)}</span>
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13.5px] leading-[1.5]">
          {rows.map((r) => (
            <React.Fragment key={r.label}>
              <dt className="text-ink-4 first-letter:uppercase">{r.label}</dt>
              <dd className="min-w-0 break-words whitespace-pre-wrap">{r.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {approval.decision === 'waiting' ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void yes()}
            className="bb-press h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-page disabled:opacity-30"
          >
            Send
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(id, 'declined')}
            className="h-9 rounded-full px-3 text-[13px] text-ink-3 transition-colors hover:text-ink disabled:opacity-30"
          >
            Not now
          </button>
        </div>
      ) : (
        <span className="text-[12.5px] text-ink-4">
          {approval.decision === 'sent' ? 'Sent' : 'Not sent'}
        </span>
      )}
      {problem && <p className="text-[13px] text-fail-ink">{problem}</p>}
    </div>
  )
}

/** One box: Enter asks, Shift+Enter makes a new line, and the box grows to a few lines. */
function Composer({
  live,
  onSend,
  onStop,
}: {
  live: boolean
  onSend: (question: string) => void
  onStop: () => void
}) {
  const [text, setText] = React.useState('')
  const box = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [text])
  const submit = () => {
    const question = text.trim()
    if (!question || live) return
    setText('')
    onSend(question)
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex w-full items-end gap-2 rounded-[24px] border border-line bg-page py-2 pr-2 pl-4 shadow-soft transition-colors focus-within:border-line-strong"
    >
      <textarea
        ref={box}
        aria-label="Ask Bubbles"
        placeholder="Ask Bubbles"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className="max-h-[168px] min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-[1.5] outline-none placeholder:text-ink-5"
      />
      {live ? (
        <button
          type="button"
          aria-label="Stop"
          onClick={onStop}
          className="bb-press flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-page"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim()}
          className="bb-press flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-page transition-opacity disabled:opacity-30"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 11.5v-9M3.5 6L7 2.5 10.5 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </form>
  )
}
