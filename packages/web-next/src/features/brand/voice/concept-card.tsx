'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { useBrand } from '@/features/schedule/posts-store'

import { useBrandKit } from '../brand-store'
import {
  EYEBROW,
  ExamplesView,
  QUIET,
  Section,
  SummaryView,
  type Voice,
  VoiceView,
  WordsView,
} from '../kit-parts'
import { voiceEdited } from '../model'
import { useTakeover, VersionLine, VoiceFields } from './editor'
import { changesBetween } from './preview'
import { publishVoice, useVoiceVersions, type VoiceVersion } from './versions'

/**
 * Concept 2, the card. The voice is one object, like a card in Wallet. Edit lifts it off the
 * page and turns it over; its back is where you rewrite it. You do not tap to save: you hold to
 * sign, and the card turns back with the new voice on its face and a seal with its number.
 */
export function VoiceCardSection() {
  const { brand } = useBrand()
  const voice = useBrandKit(brand.id).voice
  const [current] = useVoiceVersions(brand.id)
  // The version the edit started from: a publish under an open edit must not move it.
  const [open, setOpen] = React.useState<VoiceVersion | null>(null)
  const [landed, setLanded] = React.useState(false)

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
      <VersionLine {...current} />
      {open && (
        <VoiceCard
          voice={open.voice}
          current={open}
          onClose={(signed) => {
            setOpen(null)
            setLanded(signed)
          }}
        />
      )}
    </Section>
  )
}

/** How long a hold takes to sign: long enough to mean it, short enough not to wait. */
const HOLD = 1300
const FLIP = 820
const SIGNED_HOLD = 1700

type Stage = 'lift' | 'back' | 'turning' | 'signed' | 'leaving'

function VoiceCard({
  voice,
  current,
  onClose,
}: {
  voice: Voice
  current: VoiceVersion
  onClose: (signed: boolean) => void
}) {
  const { brand } = useBrand()
  const [draft, setDraft] = React.useState(voice)
  const [stage, setStage] = React.useState<Stage>('lift')
  // What the face shows: the voice as it was, then the one just signed.
  const [face, setFace] = React.useState<VoiceVersion>(current)
  const timers = React.useRef<number[]>([])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  const changes = changesBetween(voice, voiceEdited(voice, draft))
  const flipped = stage === 'back'

  React.useEffect(() => {
    // The card shows its face for a moment, then turns over.
    const t = window.setTimeout(() => setStage('back'), 520)
    const all = timers.current
    return () => {
      window.clearTimeout(t)
      all.forEach(window.clearTimeout)
    }
  }, [])

  function leave(signed: boolean) {
    setStage('leaving')
    later(() => onClose(signed), 320)
  }

  // A cancel turns the card back to the voice as it was, then puts it down.
  function cancel() {
    if (stage !== 'back') return
    setStage('turning')
    later(() => leave(false), FLIP)
  }

  // The hold's timer keeps the `sign` it started with; a cancel since then must still win.
  const stageNow = React.useRef(stage)
  React.useEffect(() => {
    stageNow.current = stage
  }, [stage])

  function sign() {
    if (stageNow.current !== 'back') return
    const version = publishVoice(brand.id, draft)
    setFace(version)
    setStage('turning')
    later(() => setStage('signed'), FLIP - 120)
    later(() => leave(true), FLIP + SIGNED_HOLD)
  }

  useTakeover(cancel)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 max-md:p-4">
      <button
        type="button"
        aria-label="Put the card down"
        onClick={cancel}
        className={`absolute inset-0 bg-ink/35 backdrop-blur-[6px] ${stage === 'leaving' ? 'bb-room-out' : 'bb-fade'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${brand.name} voice`}
        className={`relative w-[600px] max-w-full ${stage === 'leaving' ? 'bb-room-out' : 'bb-deal'}`}
        style={{ perspective: 2000 }}
      >
        <div
          className="bb-flip grid"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          <CardFace version={face} brandName={brand.name} sealed={stage === 'signed'} />
          <div
            className="col-start-1 row-start-1 flex max-h-[min(780px,calc(100svh-48px))] flex-col overflow-hidden rounded-[28px] bg-page shadow-sheet"
            style={{ transform: 'rotateY(180deg)' }}
            inert={!flipped}
          >
            <div className="flex items-center justify-between px-8 pt-7 max-md:px-5 max-md:pt-5">
              <span className={EYEBROW}>
                {brand.name} · v{current.n + 1}
              </span>
              <button
                type="button"
                onClick={cancel}
                className="-mr-3 h-8 rounded-full px-3 text-[12.5px] text-ink-3 transition-colors hover:bg-surface hover:text-ink"
              >
                Cancel
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-6 pb-8 max-md:px-5">
              {stage !== 'lift' && <VoiceFields draft={draft} onChange={setDraft} focusFirst />}
            </div>
            <div className="flex flex-col gap-2.5 border-t border-line px-8 py-5 max-md:px-5">
              <HoldToSign
                label={`Hold to sign v${current.n + 1}`}
                ready={changes.length > 0}
                onSign={sign}
              />
              <span className="text-center text-[12px] text-ink-4">
                {changes.length > 0
                  ? 'Once signed, AI writes every caption and reply this way.'
                  : 'Change something to sign a new version.'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The card's face: the voice as AI uses it, with who signed it and when. */
function CardFace({
  version,
  brandName,
  sealed,
}: {
  version: VoiceVersion
  brandName: string
  sealed: boolean
}) {
  return (
    <div className="relative col-start-1 row-start-1 flex min-h-[420px] flex-col gap-8 overflow-hidden rounded-[28px] bg-page p-8 shadow-sheet max-md:min-h-[360px] max-md:p-6">
      <div className="flex items-center justify-between">
        <span className={EYEBROW}>{brandName} · Voice</span>
        <span className="font-mono text-[11px] text-ink-4">v{version.n}</span>
      </div>
      <SummaryView summary={version.voice.summary} />
      {version.voice.words.length > 0 && <WordsView words={version.voice.words} />}
      {version.voice.examples.length > 0 && <ExamplesView examples={version.voice.examples} />}
      <div className="mt-auto flex items-end justify-between gap-4 pt-4">
        <span className="text-[12px] text-ink-4">
          {version.by === 'You' ? 'Signed by you' : `Signed by ${version.by}`} ·{' '}
          {version.when === 'Today' ? 'today' : version.when}
        </span>
        {sealed && <Seal n={version.n} />}
      </div>
    </div>
  )
}

/** A round seal with the version's number, pressed on as the card turns back. */
function Seal({ n }: { n: number }) {
  return (
    <span
      aria-label={`Signed as v${n}`}
      className="bb-stamp flex size-[76px] shrink-0 flex-col items-center justify-center rounded-full border-[1.5px] border-ink text-ink"
    >
      <span className="font-mono text-[8.5px] tracking-[0.14em] uppercase">Signed</span>
      <span className="font-display text-[26px] leading-none">v{n}</span>
    </span>
  )
}

/**
 * A press that has to be held: ink fills the button from the left, and a release before it is
 * full fills nothing. Space or Enter held does the same.
 */
function HoldToSign({
  label,
  ready,
  onSign,
}: {
  label: string
  ready: boolean
  onSign: () => void
}) {
  const [holding, setHolding] = React.useState(false)
  const timer = React.useRef(0)
  const [signed, setSigned] = React.useState(false)

  function start() {
    if (!ready || signed) return
    setHolding(true)
    timer.current = window.setTimeout(() => {
      setSigned(true)
      onSign()
    }, HOLD)
  }
  function stop() {
    if (signed) return
    window.clearTimeout(timer.current)
    setHolding(false)
  }
  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const fill = holding || signed
  const text = (
    <span className="flex items-center justify-center gap-2 text-[14px] font-medium">{label}</span>
  )
  return (
    <button
      type="button"
      disabled={!ready}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
      onContextMenu={(e) => e.preventDefault()}
      className="bb-touch-drag relative grid h-12 w-full overflow-hidden rounded-full bg-surface text-ink transition-opacity disabled:opacity-40"
    >
      <span className="col-start-1 row-start-1 flex items-center justify-center">{text}</span>
      <span
        aria-hidden="true"
        className="col-start-1 row-start-1 flex items-center justify-center bg-ink text-page"
        style={{
          clipPath: fill ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: `clip-path ${fill ? HOLD : 260}ms ${fill ? 'linear' : 'cubic-bezier(0.2,0.8,0.2,1)'}`,
        }}
      >
        {text}
      </span>
    </button>
  )
}
