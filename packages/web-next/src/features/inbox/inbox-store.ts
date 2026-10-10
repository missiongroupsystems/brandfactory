'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { INBOX_BY_BRAND } from '@/data/inbox'

import { queue } from './model'

/**
 * What the team did in the inbox, in memory and outside React, so the header's count and the
 * inbox page agree and a trip to another page keeps the work. Per brand. A reload starts over.
 */
interface BrandInboxState {
  /** Replied to, or cleared as noise. */
  done: ReadonlySet<string>
  /** A complaint sent on to a person: message id → their name. */
  sentTo: Readonly<Record<string, string>>
}

type State = Record<BrandId, BrandInboxState>

function initial(): State {
  const empty = (): BrandInboxState => ({ done: new Set(), sentTo: {} })
  return Object.fromEntries(Object.keys(INBOX_BY_BRAND).map((id) => [id, empty()])) as State
}

let state: State = initial()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function update(brandId: BrandId, fn: (s: BrandInboxState) => BrandInboxState) {
  state = { ...state, [brandId]: fn(state[brandId]) }
  listeners.forEach((l) => l())
}

export function useInbox(brandId: BrandId): BrandInboxState {
  return React.useSyncExternalStore(
    subscribe,
    () => state[brandId],
    () => state[brandId],
  )
}

/** How many real messages still need a reply: the nav's count. Noise does not count. */
export function useWaiting(brandId: BrandId): number {
  const { done } = useInbox(brandId)
  return queue(INBOX_BY_BRAND[brandId].messages, done).open.length
}

/** The reply went out (simulated), or the noise was cleared: the messages leave the inbox. */
export function markDone(brandId: BrandId, ids: string[]) {
  update(brandId, (s) => ({ ...s, done: new Set([...s.done, ...ids]) }))
}

/** The complaint went to a person, who got an alert (simulated). */
export function sendTo(brandId: BrandId, id: string, name: string) {
  update(brandId, (s) => ({ ...s, sentTo: { ...s.sentTo, [id]: name } }))
}

/** For tests: back to the inbox as the demo starts. */
export function resetInbox() {
  state = initial()
  listeners.forEach((l) => l())
}
