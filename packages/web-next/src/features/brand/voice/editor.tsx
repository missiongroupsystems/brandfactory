'use client'

import * as React from 'react'

import { CloseIcon, PlusIcon } from '@/components/icons'

import { EYEBROW, QUIET, type Voice } from '../kit-parts'

/**
 * The voice's fields for the three concepts: the voice as it reads at rest, set in the same type,
 * with a caret where you type and no boxes. A field shows itself only by a hairline on focus.
 */

const BARE = 'min-w-0 bg-transparent outline-none placeholder:text-ink-5'

export function SummaryField({
  value,
  onChange,
  size = 'lg',
  focusFirst = false,
}: {
  value: string
  onChange: (v: string) => void
  size?: 'md' | 'lg'
  focusFirst?: boolean
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!focusFirst || !el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [focusFirst])
  return (
    <textarea
      ref={ref}
      aria-label="How the brand sounds"
      value={value}
      placeholder="How does the brand sound?"
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className={`${BARE} w-full field-sizing-content resize-none font-display tracking-[-0.025em] caret-ink ${size === 'lg' ? 'text-[34px] leading-[1.18] max-md:text-[24px] max-md:leading-[1.25]' : 'text-[24px] leading-[1.3] max-md:text-[20px]'}`}
    />
  )
}

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-5 opacity-0 transition hover:bg-surface hover:text-ink group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
    >
      <CloseIcon />
    </button>
  )
}

function Add({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${QUIET} -ml-3 self-start text-ink-4`}>
      <PlusIcon size={11} />
      {children}
    </button>
  )
}

export function WordsField({
  words,
  onChange,
}: {
  words: Voice['words']
  onChange: (w: Voice['words']) => void
}) {
  const set = (i: number, key: 'use' | 'avoid', value: string) =>
    onChange(words.map((w, j) => (j === i ? { ...w, [key]: value } : w)))
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1fr_1fr_32px] gap-x-6 pb-2 max-md:grid-cols-[1.25fr_1fr_32px] max-md:gap-x-3">
        <span className={EYEBROW}>Say</span>
        <span className={EYEBROW}>Not</span>
      </div>
      {words.map((w, i) => (
        <div
          key={i}
          className="group grid grid-cols-[1fr_1fr_32px] items-center gap-x-6 border-t max-md:grid-cols-[1.25fr_1fr_32px] max-md:gap-x-3 border-line transition-colors focus-within:border-line-strong"
        >
          <input
            aria-label={`Say ${i + 1}`}
            value={w.use}
            spellCheck={false}
            autoComplete="off"
            placeholder="a word to use"
            onChange={(e) => set(i, 'use', e.target.value)}
            className={`${BARE} py-2.5 text-[15px]`}
          />
          <input
            aria-label={`Not ${i + 1}`}
            value={w.avoid}
            spellCheck={false}
            autoComplete="off"
            placeholder="instead of"
            onChange={(e) => set(i, 'avoid', e.target.value)}
            className={`${BARE} py-2.5 text-[15px] text-ink-4 decoration-ink-5 not-focus:line-through`}
          />
          <Remove
            label={`Remove ${w.use || 'pair'}`}
            onClick={() => onChange(words.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <div className="border-t border-line pt-2">
        <Add onClick={() => onChange([...words, { use: '', avoid: '' }])}>Add a pair</Add>
      </div>
    </div>
  )
}

export function LinesField({
  lines,
  onChange,
}: {
  lines: string[]
  onChange: (l: string[]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className={EYEBROW}>Sounds like</span>
      {lines.map((l, i) => (
        <div
          key={i}
          className="group flex items-start gap-2 border-l-2 border-line-strong pl-4 transition-colors focus-within:border-ink"
        >
          <textarea
            aria-label={`Line ${i + 1}`}
            value={l}
            rows={1}
            placeholder="A line that sounds like the brand"
            onChange={(e) => onChange(lines.map((x, j) => (j === i ? e.target.value : x)))}
            className={`${BARE} flex-1 field-sizing-content resize-none py-0.5 text-[15px] text-ink-2`}
          />
          <Remove
            label={`Remove line ${i + 1}`}
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <Add onClick={() => onChange([...lines, ''])}>Add a line</Add>
    </div>
  )
}

/**
 * For a space that takes the screen: the page under it holds still, Escape calls `onEscape`, and
 * the focus goes back to the control that opened it when it closes.
 */
export function useTakeover(onEscape: () => void) {
  const escape = React.useEffectEvent(onEscape)
  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && escape()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      opener?.focus({ preventScroll: true })
    }
  }, [])
}

/** "v4 · Giulia · 12 Sep": who made the voice what it is, and when. */
export function VersionLine({
  n,
  by,
  when,
  className = '',
}: {
  n: number
  by: string
  when: string
  className?: string
}) {
  return (
    <span className={`font-mono text-[11px] tracking-[0.02em] text-ink-4 ${className}`}>
      v{n} · {by} · {when}
    </span>
  )
}

/** All three fields, in the order the page reads them. */
export function VoiceFields({
  draft,
  onChange,
  focusFirst,
}: {
  draft: Voice
  onChange: (v: Voice) => void
  focusFirst?: boolean
}) {
  return (
    <div className="flex flex-col gap-10">
      <SummaryField
        value={draft.summary}
        focusFirst={focusFirst}
        onChange={(summary) => onChange({ ...draft, summary })}
      />
      <WordsField words={draft.words} onChange={(words) => onChange({ ...draft, words })} />
      <LinesField
        lines={draft.examples}
        onChange={(examples) => onChange({ ...draft, examples })}
      />
    </div>
  )
}
