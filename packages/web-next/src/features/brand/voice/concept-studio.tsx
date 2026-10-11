'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { CheckIcon, CloseIcon } from '@/components/icons'
import { useBrand } from '@/features/schedule/posts-store'

import { useBrandKit } from '../brand-store'
import { EYEBROW, QUIET, Section, type Voice, VoiceView } from '../kit-parts'
import { voiceEdited } from '../model'
import { useTakeover, VersionLine, VoiceFields } from './editor'
import { changesBetween, SAMPLES, type SampleKind } from './preview'
import { SampleDiff } from './sample'
import { publishVoice, useVoiceVersions, type VoiceVersion } from './versions'

/**
 * Concept 1, the studio. Edit opens the voice in a room of its own: the fields on the left, what
 * AI will write on the right, changing as you type. Nothing is live until you publish it as the
 * next version, with a look at what changed and a note for the team, like a library in Figma.
 */
export function VoiceStudioSection() {
  const { brand } = useBrand()
  const voice = useBrandKit(brand.id).voice
  const [current] = useVoiceVersions(brand.id)
  // The version the edit started from: a publish under an open edit must not move it.
  const [open, setOpen] = React.useState<VoiceVersion | null>(null)
  // The version just published, so the page shows it landing once.
  const [landed, setLanded] = React.useState<number | null>(null)

  return (
    <Section
      label="Voice"
      action={
        <button
          type="button"
          aria-label="Edit voice"
          onClick={() => setOpen(current)}
          className={`${QUIET} -mr-3`}
        >
          Edit
        </button>
      }
    >
      <div key={current.n} className={`flex flex-col gap-6 ${landed ? 'bb-rise' : ''}`}>
        <VoiceView voice={voice} />
      </div>
      <span className="flex items-center gap-2">
        {landed === current.n && (
          <span className="bb-pop flex size-4 items-center justify-center rounded-full bg-live text-white">
            <CheckIcon size={8} strokeWidth={2.2} />
          </span>
        )}
        <VersionLine {...current} />
      </span>
      {open && (
        <Studio
          voice={open.voice}
          next={open.n + 1}
          onClose={() => setOpen(null)}
          onPublished={(n) => {
            setOpen(null)
            setLanded(n)
          }}
        />
      )}
    </Section>
  )
}

const KINDS: SampleKind[] = ['Caption', 'Hook', 'Reply']

function Studio({
  voice,
  next,
  onClose,
  onPublished,
}: {
  voice: Voice
  next: number
  onClose: () => void
  onPublished: (n: number) => void
}) {
  const { brand } = useBrand()
  const [draft, setDraft] = React.useState(voice)
  const [kind, setKind] = React.useState<SampleKind>('Caption')
  const [review, setReview] = React.useState(false)
  const [leaving, setLeaving] = React.useState(false)
  const result = React.useMemo(() => voiceEdited(voice, draft), [voice, draft])
  const changes = changesBetween(voice, result)
  useTakeover(() => !review && onClose())

  function close(after: () => void) {
    setLeaving(true)
    window.setTimeout(after, 320)
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${brand.name} voice`}
      className={`fixed inset-0 z-50 flex flex-col overflow-y-auto bg-page ${leaving ? 'bb-room-out' : 'bb-room'}`}
    >
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-page/90 px-6 backdrop-blur max-md:h-14 max-md:px-4">
        <span className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Close without publishing"
            onClick={() => close(onClose)}
            className="-ml-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
          >
            <CloseIcon />
          </button>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-medium">{brand.name} voice</span>
            <span className="font-mono text-[10.5px] text-ink-4">Draft of v{next}</span>
          </span>
        </span>
        <span className="flex items-center gap-4">
          <span className="text-[12.5px] text-ink-4 tabular-nums max-md:hidden">
            {changes.length === 0
              ? 'No changes yet'
              : `${changes.length} change${changes.length > 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            disabled={changes.length === 0}
            onClick={() => setReview(true)}
            className="bb-press flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-page hover:opacity-85 disabled:opacity-25"
          >
            Publish v{next}
          </button>
        </span>
      </header>

      <div className="mx-auto grid w-full max-w-[1160px] grid-cols-[minmax(0,1fr)_400px] gap-20 px-6 pt-16 pb-24 max-lg:grid-cols-1 max-lg:gap-14 max-md:px-4 max-md:pt-8">
        <div className="bb-rise flex flex-col gap-8">
          <span className={EYEBROW}>How {brand.name} sounds</span>
          <VoiceFields draft={draft} onChange={setDraft} focusFirst />
        </div>

        <aside
          className="bb-rise flex flex-col gap-5 self-start lg:sticky lg:top-32"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between">
            <span className={EYEBROW}>What AI writes</span>
            <span role="tablist" aria-label="Kind" className="flex gap-0.5">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={k === kind}
                  onClick={() => setKind(k)}
                  className={`h-7 rounded-full px-2.5 text-[12px] transition-colors ${k === kind ? 'bg-surface text-ink' : 'text-ink-4 hover:text-ink'}`}
                >
                  {k}
                </button>
              ))}
            </span>
          </div>
          <div className="rounded-[20px] bg-surface-2 p-6 shadow-[inset_0_0_0_1px_var(--line)]">
            <SampleDiff
              draft={SAMPLES[brand.id][kind]}
              before={voice}
              after={result}
              labels={[`v${next - 1}`, `v${next}`]}
            />
          </div>
          <p className="text-[12.5px] leading-[1.5] text-ink-4">
            Nothing changes until you publish. Then every caption, hook and reply AI writes for{' '}
            {brand.name} uses v{next}.
          </p>
        </aside>
      </div>

      {review && (
        <PublishDialog
          next={next}
          changes={changes}
          onCancel={() => setReview(false)}
          onPublish={(note) => publishVoice(brand.id, draft, note)}
          onDone={() => close(() => onPublished(next))}
        />
      )}
    </div>,
    document.body,
  )
}

const PUBLISH_DELAY = 800
const PUBLISHED_HOLD = 1500

function PublishDialog({
  next,
  changes,
  onCancel,
  onPublish,
  onDone,
}: {
  next: number
  changes: string[]
  onCancel: () => void
  onPublish: (note: string) => void
  onDone: () => void
}) {
  const { brand } = useBrand()
  const [note, setNote] = React.useState('')
  const [step, setStep] = React.useState<'ask' | 'busy' | 'done'>('ask')
  const timer = React.useRef(0)
  const publishRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    publishRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && step === 'ask' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onCancel])
  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  function publish() {
    setStep('busy')
    timer.current = window.setTimeout(() => {
      onPublish(note)
      setStep('done')
      timer.current = window.setTimeout(onDone, PUBLISHED_HOLD)
    }, PUBLISH_DELAY)
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-6 max-md:items-end max-md:p-0">
      <button
        type="button"
        aria-label="Back to the draft"
        onClick={() => step === 'ask' && onCancel()}
        className="bb-fade absolute inset-0 bg-ink/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step === 'done' ? `v${next} published` : `Publish v${next}`}
        className="bb-rise relative flex w-[420px] flex-col gap-6 rounded-[22px] bg-page p-7 shadow-sheet max-md:bb-sheet-up max-md:w-full max-md:rounded-b-none max-md:px-5 max-md:pt-6 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]"
      >
        {step === 'done' ? (
          <div className="flex flex-col items-center gap-5 py-6 text-center">
            <span className="bb-pop flex size-14 items-center justify-center rounded-full bg-live text-white">
              <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                <path
                  className="bb-draw"
                  d="M6 13.5L11 18.5L20 8"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="flex flex-col gap-1.5">
              <span className="font-display text-[26px] leading-none">v{next} is live</span>
              <span className="text-[13.5px] text-ink-3">
                AI now writes as {brand.name} sounds.
              </span>
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10.5px] text-ink-4">
                v{next - 1} → v{next}
              </span>
              <h2 className="font-display text-[26px] leading-[1.1]">
                Publish {brand.name}’s new voice?
              </h2>
            </div>
            <ul className="flex flex-col">
              {changes.map((c) => (
                <li
                  key={c}
                  className="flex items-center gap-3 border-t border-line py-2.5 text-[14px] text-ink-2 first:border-t-0"
                >
                  <span className="size-1 shrink-0 rounded-full bg-ink-4" />
                  {c}
                </li>
              ))}
            </ul>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="A note for the team"
              placeholder="A note for the team (optional)"
              className="h-11 rounded-[12px] bg-surface px-3.5 text-[14px] outline-none placeholder:text-ink-5 focus:shadow-[inset_0_0_0_1px_var(--line-strong)]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={step === 'busy'}
                className="h-10 rounded-full px-4 text-[13.5px] text-ink-3 hover:bg-surface hover:text-ink"
              >
                Keep editing
              </button>
              <button
                ref={publishRef}
                type="button"
                onClick={publish}
                disabled={step === 'busy'}
                className="bb-press flex h-10 min-w-[120px] items-center justify-center gap-1 rounded-full bg-ink px-5 text-[13.5px] font-medium text-page"
              >
                {step === 'busy'
                  ? [0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="bb-pulse size-1 rounded-full bg-page"
                        style={{ animationDelay: `${i * 160}ms` }}
                      />
                    ))
                  : `Publish v${next}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
