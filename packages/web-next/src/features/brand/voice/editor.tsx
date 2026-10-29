'use client'

import * as React from 'react'

import { CloseIcon, PlusIcon } from '@/components/icons'

import { EYEBROW, QUIET, type Voice } from '../kit-parts'

/**
 * The voice's fields: the voice as it reads at rest, set in the same type, with a caret where
 * you type and no boxes. A field shows itself only by a hairline on focus.
 */

const BARE = 'min-w-0 bg-transparent outline-none placeholder:text-ink-5'

export function SummaryField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <textarea
      aria-label="How the brand sounds"
      value={value}
      placeholder="How does the brand sound?"
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className={`${BARE} w-full field-sizing-content resize-none font-display text-[24px] leading-[1.3] tracking-[-0.02em] caret-ink max-md:text-[20px]`}
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
 * For a space that takes the screen: the page under it holds still and cannot take the focus,
 * Escape calls `onEscape`, and the focus goes back to the control that opened it on close.
 */
export function useTakeover(root: React.RefObject<HTMLElement | null>, onEscape: () => void) {
  const escape = React.useEffectEvent(onEscape)
  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const opener = document.activeElement as HTMLElement | null
    // Everything beside the space, so Tab stays inside it.
    const behind = [...document.body.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== root.current && !el.inert,
    )
    behind.forEach((el) => (el.inert = true))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && escape()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      behind.forEach((el) => (el.inert = false))
      window.removeEventListener('keydown', onKey)
      opener?.focus({ preventScroll: true })
    }
  }, [root])
}
