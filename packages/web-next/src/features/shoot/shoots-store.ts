'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import type { Week } from '@/data/demo'
import { HOME, SHOOTS_BY_BRAND, USUAL_CREW, type CrewMember, type Shoot } from '@/data/shoots'

import { freeShootDay, moveStart } from './model'

/**
 * The shoots, in memory and outside React, like the ideas (`ideas-store.ts`): the ideas page
 * plans one, the call sheet edits it, and the calendar and the idea's page show it after the
 * navigation. A reload starts over.
 *
 * An idea is in one shoot at most: joining a shoot takes it out of the one it was in.
 */

/** Who got the Lark invite: names, as the crew lists them. */
type Invited = Record<string, string[]>

interface State {
  shoots: Record<BrandId, Shoot[]>
  invited: Invited
}

function initial(): State {
  return { shoots: { ...SHOOTS_BY_BRAND }, invited: {} }
}

let state: State = initial()
let serial = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

function update(brandId: BrandId, fn: (shoots: Shoot[]) => Shoot[]) {
  set({ ...state, shoots: { ...state.shoots, [brandId]: fn(state.shoots[brandId]) } })
}

const useState = () =>
  React.useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )

/** A brand's shoots, in date order as the seed and the planner add them. */
export function useShoots(brandId: BrandId): Shoot[] {
  return useState().shoots[brandId]
}

/** Any brand's shoot, for a link that carries only the id. */
export function useShootById(id: string): { brandId: BrandId; shoot: Shoot } | null {
  const { shoots } = useState()
  for (const [brandId, list] of Object.entries(shoots) as Array<[BrandId, Shoot[]]>) {
    const shoot = list.find((s) => s.id === id)
    if (shoot) return { brandId, shoot }
  }
  return null
}

/** The shoot an idea is in, or undefined. */
export const shootOfIdea = (shoots: Shoot[], ideaId: string) =>
  shoots.find((s) => s.ideaIds.includes(ideaId))

export function useShootOf(brandId: BrandId, ideaId: string): Shoot | undefined {
  return shootOfIdea(useShoots(brandId), ideaId)
}

/** The names a shoot's Lark invite went to. */
export function useInvited(shootId: string): string[] {
  return useState().invited[shootId] ?? []
}

/** Shoots planned in the demo, not synced from Lark: one exists only for its ideas. */
const planned = new Set<string>()

/**
 * Takes ideas out of whatever shoot holds them. A planned shoot left with no ideas goes too, so
 * moving an idea to another day does not leave an empty shoot behind; a shoot from Lark stays.
 */
const without = (shoots: Shoot[], ideaIds: string[]) =>
  shoots
    .map((s) =>
      s.ideaIds.some((i) => ideaIds.includes(i))
        ? { ...s, ideaIds: s.ideaIds.filter((i) => !ideaIds.includes(i)) }
        : s,
    )
    .filter((s) => s.ideaIds.length > 0 || !planned.has(s.id))

/**
 * A new shoot for ideas picked on the ideas page, at the brand's own room with its usual crew,
 * on the first free day ahead. Returns its id; its call sheet sets the rest.
 */
export function planShoot(
  brandId: BrandId,
  weeks: Week[],
  ideaIds: string[],
  when: { dayN?: string; start?: string } = {},
): string {
  const id = `${brandId}-shoot-${++serial}`
  const shoots = state.shoots[brandId]
  const shoot: Shoot = {
    id,
    title: 'New shoot',
    dayN: when.dayN ?? freeShootDay(weeks, shoots),
    ...moveStart({ start: '12:00', end: '17:00' }, when.start ?? '12:00'),
    place: HOME[brandId],
    crew: USUAL_CREW[brandId],
    ideaIds,
  }
  planned.add(id)
  update(brandId, (list) => [...without(list, ideaIds), shoot])
  return id
}

/**
 * The shoot day picked on an idea's page: the idea joins the shoot already on that day, or a new
 * shoot starts there for it at the time picked.
 */
export function shootIdeaOn(
  brandId: BrandId,
  weeks: Week[],
  ideaId: string,
  dayN: string,
  start: string,
) {
  const there = state.shoots[brandId].find((s) => s.dayN === dayN)
  if (!there) return planShoot(brandId, weeks, [ideaId], { dayN, start })
  if (!there.ideaIds.includes(ideaId)) {
    update(brandId, (list) =>
      without(list, [ideaId]).map((s) =>
        s.id === there.id ? { ...s, ideaIds: [...s.ideaIds, ideaId] } : s,
      ),
    )
  }
  return there.id
}

/** The idea leaves its shoot; a shoot from Lark stays on the calendar for the others. */
export function leaveShoot(brandId: BrandId, ideaId: string) {
  update(brandId, (list) => without(list, [ideaId]))
}

export type ShootEdit = Partial<Pick<Shoot, 'title' | 'dayN' | 'start' | 'end' | 'place'>>

export function editShoot(brandId: BrandId, id: string, fields: ShootEdit) {
  update(brandId, (list) => list.map((s) => (s.id === id ? { ...s, ...fields } : s)))
}

export function addCrew(brandId: BrandId, id: string, person: CrewMember) {
  update(brandId, (list) =>
    list.map((s) => (s.id === id ? { ...s, crew: [...s.crew, person] } : s)),
  )
}

export function removeCrew(brandId: BrandId, id: string, index: number) {
  update(brandId, (list) =>
    list.map((s) => (s.id === id ? { ...s, crew: s.crew.filter((_, i) => i !== index) } : s)),
  )
}

/** The Lark invite goes to everyone on the crew (simulated: nothing leaves the browser). */
export function sendInvites(brandId: BrandId, id: string) {
  const shoot = state.shoots[brandId].find((s) => s.id === id)
  if (!shoot) return
  set({ ...state, invited: { ...state.invited, [id]: shoot.crew.map((c) => c.name) } })
}

/** For tests. */
export function resetShoots() {
  set(initial())
}
