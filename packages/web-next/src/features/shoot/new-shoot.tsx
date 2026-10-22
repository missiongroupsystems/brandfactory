'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { OUTLETS, type Shoot } from '@/data/shoots'
import { useBrand } from '@/features/schedule/posts-store'
import { demoOf } from '@/lib/remote'

import { freeShootDay } from './model'
import { Details } from './shoot-page'
import { addShoot, useShoots } from './shoots-store'

/**
 * A shoot added by hand on the calendar, as the team adds one to its Lark calendar today: the
 * call sheet's own details, then Add opens the new sheet. Ideas join it later from an idea's page.
 * A wide screen opens it from the calendar's "…" menu, a phone from its plus.
 */
export function NewShootForm({ date }: { date?: string }) {
  const router = useRouter()
  const { brand, weeks } = useBrand()
  const shoots = useShoots(brand.id)
  const [draft, setDraft] = React.useState<Shoot>(() => ({
    id: '',
    title: '',
    // The day picked, unless a shoot is on it already: two would sit on the same hours.
    date: date && !shoots.some((s) => s.date === date) ? date : freeShootDay(weeks, shoots),
    start: '12:00',
    end: '17:00',
    // A brand with no outlet on record starts with no place; the sheet takes one.
    place: demoOf(OUTLETS, brand.id)?.[0] ?? '',
    crew: [],
    ideaIds: [],
  }))
  const ready = draft.title.trim() !== ''
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        const { title, place, date, start, end } = draft
        const id = addShoot(brand.id, { title: title.trim(), place, date, start, end })
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
