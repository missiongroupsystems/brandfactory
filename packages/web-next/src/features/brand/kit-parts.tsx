'use client'

import * as React from 'react'

import { CheckIcon } from '@/components/icons'
import type { BrandKit } from '@/data/brand-kit'

/** The pieces of the Brand page that its sections share. */

export const EYEBROW = 'font-mono text-[12px] tracking-[0.08em] text-ink-4 uppercase'

export const QUIET =
  'flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-3 transition-colors hover:bg-surface hover:text-ink'

export type Voice = BrandKit['voice']
export type Colour = BrandKit['colours'][number]

export function Section({
  label,
  action,
  children,
}: {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-6 border-t border-line py-9">
      <div className="-my-1.5 flex h-8 items-center justify-between">
        <h2 className={EYEBROW}>{label}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A short "Saved" after an edit, in place of a toast: shown while `at` is recent. */
export function SavedWhisper({ at }: { at: number }) {
  const [seen, setSeen] = React.useState(at)
  const [visible, setVisible] = React.useState(false)
  if (at !== seen) {
    setSeen(at)
    setVisible(true)
  }
  React.useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setVisible(false), 1600)
    return () => clearTimeout(t)
  }, [visible, seen])
  // Nothing saved yet: no word on the page, not even a faded one a screen reader or search finds.
  if (at === 0) return null
  return (
    <span
      aria-hidden={!visible}
      className={`flex items-center gap-1.5 text-[12px] text-ink-4 transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <CheckIcon size={10} />
      Saved
    </span>
  )
}

export function VoiceView({ voice }: { voice: Voice }) {
  return (
    <>
      <SummaryView summary={voice.summary} />
      {voice.words.length > 0 && <WordsView words={voice.words} />}
      {voice.examples.length > 0 && <ExamplesView examples={voice.examples} />}
    </>
  )
}

export function SummaryView({ summary }: { summary: string }) {
  return (
    <p className="font-display text-[24px] leading-[1.3] tracking-[-0.02em] max-md:text-[20px]">
      {summary}
    </p>
  )
}

export function WordsView({ words }: { words: Voice['words'] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6">
      <span className={`${EYEBROW} pb-2`}>Say</span>
      <span className={`${EYEBROW} pb-2`}>Not</span>
      {words.map((w, i) => (
        // Edits may repeat a word, so the place is the key.
        <React.Fragment key={i}>
          <span className="border-t border-line py-2.5 text-[14.5px]">{w.use}</span>
          <span className="border-t border-line py-2.5 text-[14.5px] text-ink-4 line-through decoration-ink-5">
            {w.avoid}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

export function ExamplesView({ examples }: { examples: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <span className={EYEBROW}>Sounds like</span>
      {examples.map((line, i) => (
        <p key={i} className="border-l-2 border-line-strong pl-4 text-[15px] text-ink-2">
          {line}
        </p>
      ))}
    </div>
  )
}
