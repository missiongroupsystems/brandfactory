'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { IDEAS_BY_BRAND, type IdeaCard, type IdeaSource } from '@/data/ideas'

/**
 * The ideas, in memory and outside React, so the insights page can add one and the ideas page
 * and the shoot brief find it after the navigation. No provider: `layout.tsx` stays as it is. A reload
 * starts over at five of eight, which is where the demo begins.
 */
interface BrandIdeasState {
  /** Every card, the suggested ones included; those show only once `suggesting` is true. */
  ideas: IdeaCard[]
  suggesting: boolean
  /** True once the team connected Pinterest: every board is on the page from then on. */
  pinterest: boolean
  /** How many ideas the team had when it asked for suggestions: "3 suggested from your 5". */
  suggestedFrom: number
}

type State = Record<BrandId, BrandIdeasState>

function initial(): State {
  return Object.fromEntries(
    Object.entries(IDEAS_BY_BRAND).map(([id, b]) => [
      id,
      { ideas: b.ideas, suggesting: false, pinterest: false, suggestedFrom: 0 },
    ]),
  ) as State
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

function update(brandId: BrandId, fn: (s: BrandIdeasState) => BrandIdeasState) {
  state = { ...state, [brandId]: fn(state[brandId]) }
  listeners.forEach((l) => l())
}

function patch(brandId: BrandId, id: string, fields: Partial<IdeaCard>) {
  update(brandId, (s) => ({
    ...s,
    ideas: s.ideas.map((i) => (i.id === id ? { ...i, ...fields } : i)),
  }))
}

export function useIdeas(brandId: BrandId): BrandIdeasState & { target: number } {
  const s = React.useSyncExternalStore(
    subscribe,
    () => state[brandId],
    () => state[brandId],
  )
  return { ...s, target: IDEAS_BY_BRAND[brandId].target }
}

/** Adds a card as an idea and returns its id. */
export function addIdea(
  brandId: BrandId,
  card: Omit<IdeaCard, 'id' | 'source' | 'status'>,
  source: IdeaSource,
): string {
  const id = `${brandId}-new-${++serial}`
  update(brandId, (s) => ({
    ...s,
    ideas: [...s.ideas, { ...card, id, source, status: 'idea' }],
  }))
  return id
}

/** Shows the suggestions in place, beside the team's own ideas. */
export function suggest(brandId: BrandId) {
  update(brandId, (s) => ({
    ...s,
    suggesting: true,
    suggestedFrom: s.ideas.filter((i) => i.status !== 'suggested').length,
  }))
}

export function connectPinterest(brandId: BrandId) {
  update(brandId, (s) => ({ ...s, pinterest: true }))
}

/** A suggestion becomes one of the team's ideas. */
export function keepSuggestion(brandId: BrandId, id: string) {
  patch(brandId, id, { status: 'idea' })
}

export function skipSuggestion(brandId: BrandId, id: string) {
  update(brandId, (s) => {
    const ideas = s.ideas.filter((i) => i.id !== id)
    return { ...s, ideas }
  })
}

export function setHook(brandId: BrandId, id: string, hook: string) {
  patch(brandId, id, { hook })
}

/** What the shoot brief edits on a card: its words, its shots, and the post it became. */
export function editIdea(
  brandId: BrandId,
  id: string,
  fields: Partial<Pick<IdeaCard, 'hook' | 'angle' | 'feature' | 'shots' | 'done' | 'postId'>>,
) {
  patch(brandId, id, fields)
}

/** The day a card was sent to on the calendar. */
export function setDay(brandId: BrandId, id: string, dayN: string) {
  patch(brandId, id, { dayN })
}

/** For tests. */
export function resetIdeas() {
  state = initial()
  listeners.forEach((l) => l())
}
