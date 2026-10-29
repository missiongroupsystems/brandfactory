'use client'

import * as React from 'react'

import { CheckIcon } from '@/components/icons'
import { SECTION } from '@/components/page-title'
import type { BrandKit } from '@/data/brand-kit'

/** The pieces of the Brand page that its sections share. */

/** A section's or a field's label: plain words, never mono capitals. */
export const EYEBROW = 'text-[13px] font-medium text-ink-3'

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
        <h2 className={SECTION}>{label}</h2>
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
