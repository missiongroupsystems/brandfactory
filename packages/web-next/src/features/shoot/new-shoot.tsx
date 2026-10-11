'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { HOME, type Shoot } from '@/data/shoots'
import { useBrand } from '@/features/schedule/posts-store'

import { freeShootDay } from './model'
import { Details } from './shoot-page'
import { addShoot, useShoots } from './shoots-store'

/**
 * A shoot added by hand on the calendar, as the team adds one to its Lark calendar today: the
 * call sheet's own details, then Add opens the new sheet. Ideas join it later from an idea's page.
 */
export function NewShootForm({ dayN }: { dayN?: string }) {
  const router = useRouter()
  const { brand, weeks } = useBrand()
  const shoots = useShoots(brand.id)
  const [draft, setDraft] = React.useState<Shoot>(() => ({
    id: '',
    title: '',
    // The day picked, unless a shoot is on it already: two would sit on the same hours.
    dayN: dayN && !shoots.some((s) => s.dayN === dayN) ? dayN : freeShootDay(weeks, shoots),
    start: '12:00',
    end: '17:00',
    place: HOME[brand.id],
    crew: [],
    ideaIds: [],
  }))
  const ready = draft.title.trim() !== ''
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        const { title, place, dayN, start, end } = draft
        const id = addShoot(brand.id, { title: title.trim(), place, dayN, start, end })
        router.push(`/shoot/${id}`)
      }}
      className="flex flex-col gap-4"
    >
      <Details shoot={draft} edit={(fields) => setDraft((d) => ({ ...d, ...fields }))} />
      <button
        type="submit"
        disabled={!ready}
        className="bb-press flex h-9 items-center justify-center self-end rounded-full bg-ink px-4 text-[13px] font-medium text-page transition-opacity hover:opacity-85 disabled:opacity-25 max-md:h-11 max-md:self-stretch"
      >
        Add shoot
      </button>
    </form>
  )
}

/**
 * The quiet way in on a wide screen: a plain button beside "Schedule new post", whose panel holds
 * the form. A tap outside or Escape closes it.
 */
export function NewShootButton({ dayN }: { dayN?: string }) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
      >
        New shoot
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="New shoot"
          className="bb-menu absolute top-11 right-0 z-30 flex w-[400px] origin-top-right flex-col gap-3 rounded-[16px] bg-page p-4 shadow-[0_0_0_1px_var(--line),var(--shadow-pop)]"
        >
          <span className="text-[14px] font-medium">New shoot</span>
          <NewShootForm dayN={dayN} />
        </div>
      )}
    </div>
  )
}
