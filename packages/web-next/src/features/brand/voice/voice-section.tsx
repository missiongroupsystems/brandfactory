'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { ChevronIcon, CloseIcon } from '@/components/icons'
import { useBrand } from '@/features/schedule/posts-store'
import { demoOf } from '@/lib/remote'

import { useBrandKit } from '../brand-store'
import { EYEBROW, QUIET, Section, type Voice, VoiceView } from '../kit-parts'
import { voiceEdited } from '../model'
import { LinesField, SummaryField, useTakeover, WordsField } from './editor'
import { changesBetween, SAMPLES, type SampleKind } from './preview'
import { SampleDiff } from './sample'
import { publishVoice, useVoiceVersions, type VoiceVersion } from './versions'

/**
 * The voice. Edit asks for a new voice one part at a time, a question a screen, like setting up
 * a new iPhone. The last screen is the proof: a caption, a hook and a reply as AI writes them now
 * and as it will. "Make this the voice" publishes a new version. Every version stays in the
 * history under the section, and an old one comes back the same way, as a new version.
 */
export function VoiceSection() {
  const { brand } = useBrand()
  const voice = useBrandKit(brand.id).voice
  const versions = useVoiceVersions(brand.id)
  // A brand made on the core has no version until its voice is first written.
  const [current] = versions
  const n = current?.n ?? 0
  const empty = !voice.summary && voice.words.length === 0 && voice.examples.length === 0
  // The voice when the flow opened (what the proof compares with), and the draft's start: the
  // same voice, or an old version to bring back.
  const [flow, setFlow] = React.useState<{
    base: Voice
    from: Voice
    /** The number the new version takes, fixed while the flow is open. */
    next: number
    restoring?: VoiceVersion
  } | null>(null)
  const [history, setHistory] = React.useState(false)
  const [landed, setLanded] = React.useState<number | null>(null)

  return (
    <Section
      label="Voice"
      action={
        <button
          type="button"
          aria-label="Edit voice"
          onClick={() => setFlow({ base: voice, from: voice, next: n + 1 })}
          className={`${QUIET} -mr-3`}
        >
          Edit
        </button>
      }
    >
      <div key={n} className={`flex flex-col gap-6 ${landed ? 'bb-rise' : ''}`}>
        {empty ? (
          <p className="text-[15px] text-ink-4">No voice yet.</p>
        ) : (
          <VoiceView voice={voice} />
        )}
      </div>
      {current && (
        <div className="flex flex-col">
          <button
            type="button"
            aria-expanded={history}
            aria-label="Version history"
            onClick={() => setHistory((h) => !h)}
            className="-ml-2 flex h-8 items-center gap-2 self-start rounded-full px-2 text-[12.5px] text-ink-4 transition-colors hover:bg-surface hover:text-ink-2"
          >
            <span className="font-mono text-[11px] text-ink-3">v{current.n}</span>
            <span>
              {current.by} · {current.when}
            </span>
            <ChevronIcon open={history} size={8} />
          </button>
          <div className="bb-fold" style={{ gridTemplateRows: history ? '1fr' : '0fr' }}>
            <div inert={!history}>
              <History
                versions={versions}
                landed={landed}
                onRestore={(v) =>
                  setFlow({ base: voice, from: v.voice, restoring: v, next: n + 1 })
                }
              />
            </div>
          </div>
        </div>
      )}
      {flow && (
        <Flow
          voice={flow.base}
          start={flow.from}
          restoring={flow.restoring}
          next={flow.next}
          onClose={() => setFlow(null)}
          onDone={(n) => {
            setFlow(null)
            setLanded(n)
            setHistory(true)
          }}
        />
      )}
    </Section>
  )
}

/** Like an activity feed: who made each version, and when. A hover offers to bring one back. */
function History({
  versions,
  landed,
  onRestore,
}: {
  versions: VoiceVersion[]
  landed: number | null
  onRestore: (v: VoiceVersion) => void
}) {
  return (
    <ol className="flex flex-col pt-3">
      {versions.map((v, i) => (
        <li
          key={v.n}
          className={`group relative grid grid-cols-[20px_1fr_auto] items-start gap-x-3 pb-5 last:pb-1 ${v.n === landed ? 'bb-rise' : ''}`}
        >
          {/* The thread that joins one version to the one before it. */}
          {i < versions.length - 1 && (
            <span className="absolute top-6 bottom-1 left-[9.5px] w-px bg-line" />
          )}
          <span
            aria-hidden="true"
            className={`flex size-5 items-center justify-center rounded-full text-[10px] leading-none font-medium ${i === 0 ? 'bg-ink text-page' : 'bg-surface text-ink-3'}`}
          >
            {v.by[0]}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 pt-px">
            <span className="flex items-baseline gap-2 text-[13.5px]">
              <span className="font-medium">{v.by}</span>
              <span className="font-mono text-[11px] text-ink-4">v{v.n}</span>
              {/* No hover on touch, so the date sits here and Bring back stays shown. */}
              <span className="hidden text-[12.5px] text-ink-4 [@media(hover:none)]:inline">
                {v.when}
              </span>
            </span>
            {v.note && <span className="truncate text-[13px] text-ink-3">{v.note}</span>}
          </span>
          {i === 0 ? (
            <span className="flex h-7 items-center gap-1.5 px-2.5 text-[12px] text-ink-3">
              <span className="size-1.5 rounded-full bg-live" />
              In use
            </span>
          ) : (
            <span className="relative flex h-7 items-center justify-end">
              <span className="px-2.5 text-[12px] text-ink-4 transition-opacity duration-200 group-focus-within:opacity-0 group-hover:opacity-0 [@media(hover:none)]:hidden">
                {v.when}
              </span>
              <button
                type="button"
                onClick={() => onRestore(v)}
                className="absolute inset-y-0 right-0 flex items-center rounded-full px-2.5 text-[12px] whitespace-nowrap text-ink-2 opacity-0 transition duration-200 group-hover:opacity-100 hover:bg-surface hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:opacity-100"
              >
                Bring back
              </button>
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

const KINDS: SampleKind[] = ['Caption', 'Hook', 'Reply']
const STEPS = 4
const PROOF = STEPS - 1
/** How long a step takes to leave, and how long "in use" holds before the flow closes. */
const LEAVE = 160
const HOLD = 1700
const CLOSE = 300

/** Timeouts that all stop when the flow closes or unmounts, so none fires late. */
function useLater() {
  const ids = React.useRef(new Set<number>())
  React.useEffect(() => {
    const set = ids.current
    return () => set.forEach((id) => window.clearTimeout(id))
  }, [])
  return React.useMemo(
    () => ({
      after(ms: number, fn: () => void) {
        const id = window.setTimeout(() => {
          ids.current.delete(id)
          fn()
        }, ms)
        ids.current.add(id)
      },
      cancel() {
        ids.current.forEach((id) => window.clearTimeout(id))
        ids.current.clear()
      },
    }),
    [],
  )
}

function Flow({
  voice,
  start,
  restoring,
  next,
  onClose,
  onDone,
}: {
  voice: Voice
  start: Voice
  restoring?: VoiceVersion
  next: number
  onClose: () => void
  onDone: (n: number) => void
}) {
  const { brand } = useBrand()
  const root = React.useRef<HTMLDivElement>(null)
  const body = React.useRef<HTMLDivElement>(null)
  const heading = React.useRef<HTMLHeadingElement>(null)
  const later = useLater()
  const [draft, setDraft] = React.useState(start)
  // A version brought back goes straight to the proof.
  const [step, setStep] = React.useState(restoring ? PROOF : 0)
  // Which way the steps move (1 forward, -1 back, 0 on open), and whether one is leaving.
  const [dir, setDir] = React.useState(0)
  const [leavingStep, setLeavingStep] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [leaving, setLeaving] = React.useState(false)
  const result = React.useMemo(() => voiceEdited(voice, draft), [voice, draft])
  const changes = changesBetween(voice, result)
  const changed = changes.length > 0
  const proof = step === PROOF

  function close(after: () => void) {
    if (leaving) return
    later.cancel()
    setLeaving(true)
    later.after(CLOSE, after)
  }
  // Once the voice is in use, closing is finishing: it does not wait out the hold.
  const leave = () => close(done ? () => onDone(next) : onClose)
  useTakeover(root, leave)

  function go(by: 1 | -1) {
    const to = step + by
    if (leavingStep || done || to < 0 || to > PROOF) return
    setDir(by)
    setLeavingStep(true)
    later.after(LEAVE, () => {
      setStep(to)
      setLeavingStep(false)
    })
  }

  function commit() {
    if (!proof || !changed || done || leaving) return
    // The history says what changed, in the words of the review.
    const note = restoring
      ? `Brought back v${restoring.n}`
      : changes.length > 1
        ? `${changes[0]}, and ${changes.length - 1} more`
        : changes[0]
    publishVoice(brand.id, draft, note)
    setDone(true)
    later.after(HOLD, () => close(() => onDone(next)))
  }

  // Each step puts the caret in its first field; the proof reads its question first.
  React.useEffect(() => {
    const field = body.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea',
    )
    const target = field ?? heading.current
    target?.focus({ preventScroll: true })
    if (field) field.setSelectionRange(field.value.length, field.value.length)
  }, [step])

  const onEnter = React.useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
    // A focused button keeps Enter for itself.
    if ((e.target as HTMLElement).closest('button')) return
    if (proof) {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        commit()
      }
      return
    }
    e.preventDefault()
    go(1)
  })
  // Enter moves on from any field in the flow; on the proof, only ⌘Enter publishes.
  React.useEffect(() => {
    const el = root.current
    const onKey = (e: KeyboardEvent) => onEnter(e)
    el?.addEventListener('keydown', onKey)
    return () => el?.removeEventListener('keydown', onKey)
  }, [])

  const question = done
    ? `${brand.name} sounds like this now.`
    : [
        `How should ${brand.name} sound?`,
        'Say this, not that.',
        'It sounds like this.',
        restoring ? `Bring back v${restoring.n}?` : 'Here is what changes.',
      ][step]
  const hint = done
    ? `v${next} writes every caption, hook and reply.`
    : [
        'Two sentences. AI reads them first.',
        'Words to reach for, and words to never use.',
        'Lines the team would post as they are.',
        `What AI writes now, and as v${next}.`,
      ][step]

  // Forward, a step leaves left and the next comes in from the right; back, the other way.
  const motion = leavingStep
    ? { className: 'bb-step-out', style: { '--x': `${-20 * dir}px` } }
    : { className: 'bb-step', style: { '--x': `${32 * dir}px`, '--y': dir ? '0px' : '12px' } }

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`${brand.name} voice`}
      className={`fixed inset-0 z-50 flex flex-col bg-page ${leaving ? 'bb-room-out' : 'bb-room'}`}
    >
      <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-6 max-md:h-14 max-md:px-4">
        <span />
        <Progress step={step} done={done} />
        <button
          type="button"
          aria-label={done ? 'Close' : 'Close without changing the voice'}
          onClick={leave}
          className="-mr-2 flex size-9 items-center justify-center justify-self-end rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div
          key={step}
          className={`mx-auto flex w-full max-w-[600px] flex-col px-6 pt-[13vh] pb-12 max-md:px-4 max-md:pt-6 ${motion.className}`}
          style={motion.style as React.CSSProperties}
        >
          <div key={String(done)} className={`flex flex-col gap-2.5 ${done ? 'bb-rise' : ''}`}>
            <h2
              ref={heading}
              tabIndex={-1}
              className="font-display text-[40px] leading-[1.08] tracking-[-0.032em] text-balance outline-none max-md:text-[28px] max-md:leading-[1.12]"
            >
              {question}
            </h2>
            <p className="text-[15px] text-ink-3 max-md:text-[14px]">{hint}</p>
          </div>

          <div
            ref={body}
            className={`mt-12 max-md:mt-8 ${leavingStep ? '' : 'bb-rise'}`}
            style={{ animationDelay: '70ms' }}
          >
            {step === 0 && (
              <SummaryField
                value={draft.summary}
                onChange={(summary) => setDraft({ ...draft, summary })}
              />
            )}
            {step === 1 && (
              <WordsField words={draft.words} onChange={(words) => setDraft({ ...draft, words })} />
            )}
            {step === 2 && (
              <LinesField
                lines={draft.examples}
                onChange={(examples) => setDraft({ ...draft, examples })}
              />
            )}
            {proof && (
              <div className="flex flex-col">
                {KINDS.map((k, i) => (
                  <div
                    key={k}
                    className="bb-rise flex flex-col gap-3 border-t border-line py-6 first:border-t-0 first:pt-0"
                    style={{ animationDelay: `${80 + i * 80}ms` }}
                  >
                    <span className={EYEBROW}>{k}</span>
                    <SampleDiff
                      draft={demoOf(SAMPLES, brand.id)?.[k] ?? ''}
                      before={voice}
                      after={result}
                      labels={[`v${next - 1}`, `v${next}`]}
                      stagger={360 + i * 140}
                      hideBefore={done}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="relative shrink-0 before:pointer-events-none before:absolute before:inset-x-0 before:-top-10 before:h-10 before:bg-linear-to-t before:from-page before:to-transparent">
        <div className="mx-auto flex w-full max-w-[600px] items-center justify-between px-6 pt-3 pb-8 max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => go(-1)}
            className={`-ml-4 h-10 rounded-full px-4 text-[13.5px] text-ink-3 transition duration-300 hover:bg-surface hover:text-ink ${step === 0 || done || restoring ? 'pointer-events-none opacity-0' : ''}`}
            tabIndex={step === 0 || done || restoring ? -1 : undefined}
          >
            Back
          </button>
          {done ? (
            <InUse from={next - 1} to={next} />
          ) : proof ? (
            <button
              type="button"
              disabled={!changed}
              onClick={commit}
              className="bb-press flex h-11 items-center gap-3 rounded-full bg-ink pr-4 pl-5 text-[14px] font-medium text-page hover:opacity-85 disabled:pr-5 disabled:opacity-25"
            >
              {changed ? 'Make this the voice' : 'No changes'}
              {changed && <Kbd>⌘↵</Kbd>}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(1)}
              className="bb-press flex h-11 items-center gap-3 rounded-full bg-ink pr-4 pl-5 text-[14px] font-medium text-page hover:opacity-85 max-md:pr-5"
            >
              Continue
              <Kbd>↵</Kbd>
            </button>
          )}
        </div>
      </footer>
    </div>,
    document.body,
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-sans text-[12px] text-page/50 max-md:hidden" aria-hidden="true">
      {children}
    </kbd>
  )
}

/** Four marks; the one you are on stretches into a bar. All four fill once the voice is in use. */
function Progress({ step, done }: { step: number; done: boolean }) {
  return (
    <span
      role="progressbar"
      aria-label="Steps"
      aria-valuemin={1}
      aria-valuemax={STEPS}
      aria-valuenow={step + 1}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: STEPS }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${i === step && !done ? 'w-5' : 'w-1.5'} ${i <= step || done ? 'bg-ink' : 'bg-track'}`}
        />
      ))}
    </span>
  )
}

/** The commit, said once: a check draws and the version number rolls up to the new one. */
function InUse({ from, to }: { from: number; to: number }) {
  return (
    <span role="status" className="flex h-11 items-center gap-2.5 pr-1 text-[14px] font-medium">
      <span className="bb-ring flex size-6 items-center justify-center rounded-full bg-ink text-page">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2.5 6.3L5 8.7L9.5 3.5"
            pathLength={48}
            className="bb-draw"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="sr-only">v{to} is in use</span>
      <span aria-hidden="true">
        v
        <span className="relative inline-grid overflow-hidden align-bottom tabular-nums">
          <span
            className="bb-step-out col-start-1 row-start-1"
            style={{ '--y': '-100%', animationDelay: '200ms' } as React.CSSProperties}
          >
            {from}
          </span>
          <span
            className="bb-step col-start-1 row-start-1"
            style={{ '--y': '100%', animationDelay: '260ms' } as React.CSSProperties}
          >
            {to}
          </span>
        </span>{' '}
        is in use
      </span>
    </span>
  )
}
