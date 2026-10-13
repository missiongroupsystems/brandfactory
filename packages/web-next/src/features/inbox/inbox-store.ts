'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { INBOX_BY_BRAND } from '@/data/inbox'

import { onState, push, remote, request } from '@/lib/remote'

import { queue } from './model'

/**
 * What the team did in the inbox, in memory and outside React, so the header's count and the
 * inbox page agree and a trip to another page keeps the work. Per brand. A reload starts over.
 */
interface BrandInboxState {
  /** Replied to, or cleared as noise. */
  done: ReadonlySet<string>
  /** A complaint sent on to people: message id → their names. */
  sentTo: Readonly<Record<string, string[]>>
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

/** Each brand's people by name: the send-to menu speaks names, the server ids. */
const personIds: Record<string, Record<string, string>> = {}

// The messages themselves are the demo's (the server holds the same, seeded from them, until the
// platforms' inboxes are read); what the team did with them comes from the server.
if (remote) {
  onState((brandId, s) => {
    const people = s.inbox.people as { id: string; name: string }[]
    const rows = s.inbox.messages as { id: string; doneAt: string | null; sentTo: string[] }[]
    personIds[brandId] = Object.fromEntries(people.map((p) => [p.name, p.id]))
    update(brandId as BrandId, () => ({
      done: new Set(rows.filter((m) => m.doneAt).map((m) => m.id)),
      sentTo: Object.fromEntries(
        rows
          .filter((m) => m.sentTo.length > 0)
          .map((m) => [m.id, m.sentTo.map((p) => people.find((x) => x.id === p)?.name ?? p)]),
      ),
    }))
  })
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

/** A reply was sent: it is kept with who sent it, and the message leaves the inbox. */
export function sendReply(brandId: BrandId, id: string, text: string) {
  markDone(brandId, [id])
  push(brandId, () => request('POST', `/brands/${brandId}/inbox/${id}/reply`, { text }))
}

/** The noise is cleared, all of it at once. */
export function clearNoise(brandId: BrandId, ids: string[]) {
  markDone(brandId, ids)
  push(brandId, () => request('POST', `/brands/${brandId}/inbox/clear-noise`))
}

/** The complaint went to one person or more, who each got an alert (simulated). */
export function sendTo(brandId: BrandId, id: string, names: string[]) {
  update(brandId, (s) => ({ ...s, sentTo: { ...s.sentTo, [id]: names } }))
  const people = names.map((n) => personIds[brandId]?.[n] ?? n)
  push(brandId, () => request('POST', `/brands/${brandId}/inbox/${id}/send-to`, { people }))
}

/** For tests: back to the inbox as the demo starts. */
export function resetInbox() {
  state = initial()
  listeners.forEach((l) => l())
}
