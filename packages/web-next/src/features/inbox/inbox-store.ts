'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { INBOX_BY_BRAND, type InboxMessage } from '@/data/inbox'

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
  /** On the core: the ids of the messages the server holds. */
  held?: ReadonlySet<string>
}

type State = Record<BrandId, BrandInboxState>

const empty = (): BrandInboxState => ({ done: new Set(), sentTo: {} })
/** A brand made on the core, before its state loads: nothing done yet. */
const EMPTY = empty()

function initial(): State {
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
  state = { ...state, [brandId]: fn(state[brandId] ?? EMPTY) }
  listeners.forEach((l) => l())
}

/** Each brand's people by name: the send-to menu speaks names, the server ids. */
const personIds: Record<string, Record<string, string>> = {}

/** A message the server keeps, as the brand's state names it. */
interface Row {
  id: string
  platform: 'ig' | 'fb' | 'tt'
  kind: 'comment' | 'mention' | 'dm'
  fromName: string
  fromHandle: string
  text: string
  receivedAt: string
  doneAt: string | null
  sentTo: string[]
  /** Set for a comment or DM that came through Meta's webhook. */
  external?: object | null
}

/**
 * Each brand's real comments and DMs from Instagram and Facebook, through our own Meta app. They
 * carry no AI replies: the team writes its own.
 */
const real: Partial<Record<BrandId, InboxMessage[]>> = {}

const fromMeta = (r: Row): InboxMessage => ({
  id: r.id,
  platform: r.platform,
  kind: r.kind,
  from: { name: r.fromName, handle: r.fromHandle },
  text: r.text,
  minutes: Math.max(0, Math.round((Date.now() - Date.parse(r.receivedAt)) / 60_000)),
  tone: 'question',
  replies: [],
})

// The messages themselves are the demo's (the server holds the same, seeded from them, until the
// platforms' inboxes are read); what the team did with them comes from the server.
if (remote) {
  onState((brandId, s) => {
    const people = s.inbox.people as { id: string; name: string }[]
    const rows = s.inbox.messages as Row[]
    personIds[brandId] = Object.fromEntries(people.map((p) => [p.name, p.id]))
    real[brandId as BrandId] = rows.filter((r) => r.external).map(fromMeta)
    update(brandId as BrandId, () => ({
      held: new Set(rows.map((m) => m.id)),
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
    () => state[brandId] ?? EMPTY,
    () => state[brandId] ?? EMPTY,
  )
}

/**
 * The brand's messages. The text is the demo's; on the core only the ones the server holds show,
 * so a real brand does not get the demo's invented messages, and the comments and DMs that came
 * through Meta. A caller reads it under `useInbox`,
 * so it renders again when the server's state arrives.
 */
export function messagesOf(brandId: BrandId): InboxMessage[] {
  const messages = INBOX_BY_BRAND[brandId]?.messages ?? []
  const held = state[brandId]?.held
  return remote ? [...messages.filter((m) => held?.has(m.id)), ...(real[brandId] ?? [])] : messages
}

/** How many real messages still need a reply: the nav's count. Noise does not count. */
export function useWaiting(brandId: BrandId): number {
  const { done } = useInbox(brandId)
  return queue(messagesOf(brandId), done).open.length
}

/** The reply went out (simulated), or the noise was cleared: the messages leave the inbox. */
export function markDone(brandId: BrandId, ids: string[]) {
  update(brandId, (s) => ({ ...s, done: new Set([...s.done, ...ids]) }))
}

const isMeta = (brandId: BrandId, id: string) => (real[brandId] ?? []).some((m) => m.id === id)

/**
 * A reply was sent: it is kept with who sent it, and the message leaves the inbox. One that came
 * through Meta goes to Instagram or Facebook; if Meta refuses, the brand reloads and it is back.
 */
export function sendReply(brandId: BrandId, id: string, text: string) {
  markDone(brandId, [id])
  const path = isMeta(brandId, id) ? 'meta-reply' : 'reply'
  push(brandId, () => request('POST', `/brands/${brandId}/inbox/${id}/${path}`, { text }))
}

/** True for a comment that came through Meta: it can be hidden on the platform. */
export const canHide = (brandId: BrandId, m: InboxMessage) =>
  m.kind === 'comment' && isMeta(brandId, m.id)

/** Hides the comment on Instagram or Facebook; it leaves the inbox. */
export function hideComment(brandId: BrandId, id: string) {
  markDone(brandId, [id])
  push(brandId, () => request('POST', `/brands/${brandId}/inbox/${id}/meta-hide`))
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
