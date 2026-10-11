'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { CheckIcon, CloseIcon } from '@/components/icons'
import { useBrand } from '@/features/schedule/posts-store'

import { useBrandKit } from '../brand-store'
import { EYEBROW, QUIET, Section, type Voice, VoiceView } from '../kit-parts'
import { voiceEdited } from '../model'
import { LinesField, SummaryField, useTakeover, VersionLine, WordsField } from './editor'
import { changesBetween, SAMPLES, type SampleKind } from './preview'
import { SampleDiff } from './sample'
import { publishVoice, useVoiceVersions, type VoiceVersion } from './versions'

/**
 * Concept 3, the rewrite. A new voice is asked for one part at a time, a question a screen, like
 * setting up a new iPhone. The last screen is the proof: a caption, a hook and a reply as AI
 * writes them now and as it will. "Make this the voice" folds the old lines away. Every version
 * stays in the history under the section, and an old one can come back the same way.
 */
export function VoiceStepsSection() {
  const { brand } = useBrand()
  const voice = useBrandKit(brand.id).voice
  const versions = useVoiceVersions(brand.id)
  const [current] = versions
  // The flow's start: the voice as it is, or an old version to bring back.
  const [flow, setFlow] = React.useState<{
    base: VoiceVersion
    from: Voice
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
          onClick={() => setFlow({ base: current, from: voice })}
          className={`${QUIET} -mr-3`}
        >
          Rewrite
        </button>
      }
    >
      <div key={current.n} className={`flex flex-col gap-6 ${landed ? 'bb-rise' : ''}`}>
        <VoiceView voice={voice} />
      </div>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={history}
          onClick={() => setHistory((h) => !h)}
          className="-ml-1 flex items-center gap-3 self-start rounded-full px-1 py-1 text-ink-4 transition-colors hover:text-ink"
        >
          <VersionLine {...current} className="text-inherit" />
          <span className="text-[12px] underline-offset-2 hover:underline">
            {history ? 'Hide history' : 'History'}
          </span>
        </button>
        <div className="bb-fold" style={{ gridTemplateRows: history ? '1fr' : '0fr' }}>
          <div inert={!history}>
            <History
              versions={versions}
              landed={landed}
              onRestore={(v) => setFlow({ base: current, from: v.voice, restoring: v })}
            />
          </div>
        </div>
      </div>
      {flow && (
        <Rewrite
          voice={flow.base.voice}
          start={flow.from}
          restoring={flow.restoring}
          next={flow.base.n + 1}
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
    <ol className="flex flex-col pt-1 pl-1">
      {versions.map((v, i) => (
        <li
          key={v.n}
          className={`relative flex items-start gap-4 pb-4 last:pb-0 ${v.n === landed ? 'bb-rise' : ''}`}
        >
          {/* The line that joins one version to the one before it. */}
          {i < versions.length - 1 && (
            <span className="absolute top-3 bottom-0 left-[3.5px] w-px bg-line-strong" />
          )}
          <span
            className={`relative mt-[5px] size-2 shrink-0 rounded-full ${i === 0 ? 'bg-ink' : 'border border-ink-5 bg-page'}`}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-[13.5px]">
              <span className="font-medium">v{v.n}</span>
              <span className="text-ink-4">
                {v.by} · {v.when}
              </span>
            </span>
            {v.note && <span className="truncate text-[13px] text-ink-3">{v.note}</span>}
          </span>
          {i === 0 ? (
            <span className="text-[12px] text-ink-4">In use</span>
          ) : (
            <button
              type="button"
              onClick={() => onRestore(v)}
              className="-my-1 -mr-2.5 h-7 rounded-full px-2.5 text-[12px] text-ink-3 transition-colors hover:bg-surface hover:text-ink"
            >
              Bring back
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

const KINDS: SampleKind[] = ['Caption', 'Hook', 'Reply']
const STEPS = 4
const DONE_HOLD = 2000

function Rewrite({
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
  const [draft, setDraft] = React.useState(start)
  // A version brought back goes straight to the proof.
  const [step, setStep] = React.useState(restoring ? STEPS - 1 : 0)
  const [done, setDone] = React.useState(false)
  const [leaving, setLeaving] = React.useState(false)
  const timer = React.useRef(0)
  const result = React.useMemo(() => voiceEdited(voice, draft), [voice, draft])
  const changed = changesBetween(voice, result).length > 0
  const proof = step === STEPS - 1

  function close(after: () => void) {
    setLeaving(true)
    timer.current = window.setTimeout(after, 320)
  }
  useTakeover(() => !done && close(onClose))
  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  function commit() {
    publishVoice(brand.id, draft, restoring ? `Brought back v${restoring.n}` : '')
    setDone(true)
    timer.current = window.setTimeout(() => close(() => onDone(next)), DONE_HOLD)
  }

  const question = [
    `How should ${brand.name} sound?`,
    'Say this, not that.',
    'It sounds like this.',
    done
      ? `This is how ${brand.name} sounds now.`
      : restoring
        ? `Bring back v${restoring.n}?`
        : 'Here is what changes.',
  ][step]
  const hint = [
    'Two sentences. AI reads them first, every time.',
    'The words AI reaches for, and the ones it never uses.',
    'A few lines the team would post as they are.',
    done
      ? `v${next} is in use for every caption, hook and reply.`
      : `What AI writes today, and what it will write as v${next}.`,
  ][step]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Rewrite ${brand.name} voice`}
      className={`fixed inset-0 z-50 flex flex-col bg-page ${leaving ? 'bb-room-out' : 'bb-room'}`}
    >
      <header className="flex h-16 shrink-0 items-center gap-6 px-6 max-md:h-14 max-md:px-4">
        <div className="flex flex-1 gap-1.5" aria-label={`Step ${step + 1} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-track">
              {i <= step && <span className="bb-fill block h-full rounded-full bg-ink" />}
            </span>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close without changing the voice"
          onClick={() => !done && close(onClose)}
          className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          key={step}
          className="bb-rise mx-auto flex w-full max-w-[680px] flex-col gap-10 px-6 pt-[12vh] pb-16 max-md:gap-8 max-md:px-4 max-md:pt-8"
        >
          <div key={String(done)} className={`flex flex-col gap-3 ${done ? 'bb-rise' : ''}`}>
            <span className={EYEBROW}>{done ? `v${next}` : `${step + 1} of ${STEPS}`}</span>
            <h2 className="font-display text-[44px] leading-[1.05] tracking-[-0.035em] max-md:text-[30px]">
              {question}
            </h2>
            <p className="text-[14.5px] text-ink-3">{hint}</p>
          </div>

          {step === 0 && (
            <SummaryField
              value={draft.summary}
              size="md"
              focusFirst
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
              {KINDS.map((k) => (
                <div key={k} className="flex flex-col gap-3 border-t border-line py-6">
                  <span className={EYEBROW}>{k}</span>
                  <SampleDiff
                    draft={SAMPLES[brand.id][k]}
                    before={voice}
                    after={result}
                    labels={[`v${next - 1}`, `v${next}`]}
                    stagger
                    hideBefore={done}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-line px-6 py-4 max-md:px-4 max-md:pb-[calc(16px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          className={`h-10 rounded-full px-4 text-[13.5px] text-ink-3 transition-colors hover:bg-surface hover:text-ink ${step === 0 || done || restoring ? 'invisible' : ''}`}
        >
          Back
        </button>
        {done ? (
          <span className="flex h-11 items-center gap-2 px-2 text-[14px] font-medium">
            <span className="bb-pop flex size-5 items-center justify-center rounded-full bg-live text-white">
              <CheckIcon size={9} strokeWidth={2.2} />
            </span>
            In use
          </span>
        ) : proof ? (
          <button
            type="button"
            disabled={!changed}
            onClick={commit}
            className="bb-press flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-page hover:opacity-85 disabled:opacity-25"
          >
            {changed ? 'Make this the voice' : 'Nothing has changed'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="bb-press flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-page hover:opacity-85"
          >
            Continue
          </button>
        )}
      </footer>
    </div>,
    document.body,
  )
}
