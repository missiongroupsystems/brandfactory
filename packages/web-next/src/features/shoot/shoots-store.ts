'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import type { Week } from '@/data/demo'
import {
  HOME,
  REPLY_OF,
  SHOOTS_BY_BRAND,
  USUAL_CREW,
  type CrewMember,
  type Reply,
  type Shoot,
} from '@/data/shoots'

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
/** What each invited person answered, by shoot and name. */
type Replies = Record<string, Record<string, Reply>>

interface State {
  shoots: Record<BrandId, Shoot[]>
  invited: Invited
  replies: Replies
}

function initial(): State {
  return { shoots: { ...SHOOTS_BY_BRAND }, invited: {}, replies: {} }
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

const NO_REPLIES: Record<string, Reply> = {}

/** The answers to a shoot's Lark invite, by name. */
export function useReplies(shootId: string): Record<string, Reply> {
  return useState().replies[shootId] ?? NO_REPLIES
}

/**
 * Shoots planned from ideas in the demo: one exists only for its ideas. A shoot from Lark, or one
 * added by hand on the calendar, stays with none.
 */
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
 * A shoot added by hand on the calendar, as the team keeps one in Lark: a name, a place, a day
 * and its hours, with the brand's usual crew. It has no ideas yet; they join from an idea's page.
 * Returns its id.
 */
export function addShoot(
  brandId: BrandId,
  fields: Pick<Shoot, 'title' | 'place' | 'dayN' | 'start' | 'end'>,
): string {
  const id = `${brandId}-shoot-${++serial}`
  update(brandId, (list) => [...list, { id, ...fields, crew: USUAL_CREW[brandId], ideaIds: [] }])
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

/**
 * An idea picked on a shoot's own page joins it, and leaves the shoot it was on. Its shoot day
 * and hours are this shoot's from then on: the idea page reads them from the shoot.
 */
export function addIdeaToShoot(brandId: BrandId, shootId: string, ideaId: string) {
  // The idea lands first, then the shoot it left is pruned: the target may itself be a planned
  // shoot with no idea left, which must not go.
  update(brandId, (list) =>
    list
      .map((s) => {
        const rest = s.ideaIds.filter((i) => i !== ideaId)
        return s.id === shootId ? { ...s, ideaIds: [...rest, ideaId] } : { ...s, ideaIds: rest }
      })
      .filter((s) => s.ideaIds.length > 0 || !planned.has(s.id)),
  )
}

/**
 * The order the ideas are shot in, from a drag of a group on the call sheet. An id the shoot does
 * not hold is ignored; one the new order leaves out keeps its place at the end.
 */
export function setIdeaOrder(brandId: BrandId, shootId: string, ideaIds: string[]) {
  update(brandId, (list) =>
    list.map((s) =>
      s.id === shootId
        ? {
            ...s,
            ideaIds: [
              ...ideaIds.filter((i) => s.ideaIds.includes(i)),
              ...s.ideaIds.filter((i) => !ideaIds.includes(i)),
            ],
          }
        : s,
    ),
  )
}

/**
 * An idea taken off a shoot on the shoot's own page. The shoot stays, with its crew and hours,
 * even with no idea left: the team is looking at it.
 */
export function removeIdeaFromShoot(brandId: BrandId, shootId: string, ideaId: string) {
  update(brandId, (list) =>
    list.map((s) =>
      s.id === shootId ? { ...s, ideaIds: s.ideaIds.filter((i) => i !== ideaId) } : s,
    ),
  )
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

/** How long the crew takes to answer an invite in the demo. */
export const REPLY_DELAY = 1500

/**
 * The Lark invite goes to everyone on the crew (simulated: nothing leaves the browser). The
 * answers come in a moment later, from `REPLY_OF`; whoever is not there stays at no reply.
 */
export function sendInvites(brandId: BrandId, id: string) {
  const shoot = state.shoots[brandId].find((s) => s.id === id)
  if (!shoot) return
  const names = shoot.crew.map((c) => c.name)
  set({ ...state, invited: { ...state.invited, [id]: names } })
  setTimeout(() => {
    // A reset in between (a test) un-invites everyone: no answer arrives then.
    const asked = names.filter((n) => state.invited[id]?.includes(n) && REPLY_OF[n])
    if (asked.length === 0) return
    const answers = Object.fromEntries(asked.map((n) => [n, REPLY_OF[n]!]))
    set({ ...state, replies: { ...state.replies, [id]: { ...state.replies[id], ...answers } } })
  }, REPLY_DELAY)
}

/** For tests. */
export function resetShoots() {
  set(initial())
}
