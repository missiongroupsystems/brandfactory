'use client'

import * as React from 'react'

import { loadBrand, newId, remote, settled } from '@/lib/remote'

import {
  approveMove,
  newTurn,
  reduce,
  running,
  sendTurn,
  type HistoryItem,
  type Turn,
  type TurnEvent,
} from './client'
import { brandOf, changes, inputOf } from './cards/model'

/**
 * The chat, in memory and outside React, so a turn keeps streaming while the person looks at
 * another page, and in sessionStorage so a reload in the same tab keeps the transcript. A new
 * tab starts a new chat.
 */
export interface Chat {
  /** One UUID per chat: Bubbles keeps its runtime by it. */
  conversation: string
  turns: Turn[]
}

const KEY = 'bubbles.chat'
const EMPTY: Chat = { conversation: '', turns: [] }
/** Bubbles takes at most this many history items; the newest matter most. */
const HISTORY_MAX = 50

function fresh(): Chat {
  return { conversation: newId(), turns: [] }
}

const isTurn = (t: unknown): t is Turn => {
  if (typeof t !== 'object' || t === null) return false
  const x = t as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    typeof x.question === 'string' &&
    typeof x.status === 'string' &&
    Array.isArray(x.tools) &&
    Array.isArray(x.texts) &&
    typeof x.startedAt === 'number'
  )
}

const isChat = (c: unknown): c is Chat =>
  typeof c === 'object' &&
  c !== null &&
  typeof (c as Chat).conversation === 'string' &&
  Array.isArray((c as Chat).turns) &&
  (c as Chat).turns.every(isTurn)

/** The stored chat, or a fresh one when what is stored is not a chat this page can show. */
function load(): Chat {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return fresh()
    const saved: unknown = JSON.parse(raw)
    if (!isChat(saved)) return fresh()
    // A turn that was still running when the tab reloaded has no stream to come back to.
    return {
      conversation: saved.conversation,
      turns: saved.turns.map((t) => (running(t) ? { ...t, status: 'stopped' } : t)),
    }
  } catch {
    return fresh()
  }
}

let chat: Chat = typeof window === 'undefined' ? EMPTY : load()
const listeners = new Set<() => void>()
/** The turn on its way now, with the handle that ends it. */
let current: { id: string; controller: AbortController } | null = null
let brand: string | undefined

/** The brand on screen; each question goes with it. */
export function setBrand(id: string): void {
  brand = id
}

function update(fn: (c: Chat) => Chat) {
  chat = fn(chat)
  try {
    sessionStorage.setItem(KEY, JSON.stringify(chat))
  } catch {
    // Private mode: the chat lasts as long as the page.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useChat(): Chat {
  return React.useSyncExternalStore(
    subscribe,
    () => chat,
    () => EMPTY,
  )
}

/** Applies an event to its turn; a turn that left the transcript (New chat) takes nothing. */
function apply(id: string, event: TurnEvent) {
  if (event.name === 'tool_result' && event.data.ok) {
    const call = chat.turns.find((t) => t.id === id)?.tools.find((t) => t.id === event.data.id)
    const brand = call && brandOf(inputOf(call))
    if (call && brand && changes(call.tool)) refresh(brand)
  }
  update((c) => ({ ...c, turns: c.turns.map((t) => (t.id === id ? reduce(t, event) : t)) }))
}

/** Brands loading again, and whether a change landed meanwhile that wants one more load. */
const refreshing = new Map<string, boolean>()

/**
 * A move changed something on the core: the brand loads again, so the stores (and the cards
 * drawn from them) show the thing as it is stored. One load at a time per brand.
 */
function refresh(brand: string) {
  if (!remote) return
  if (refreshing.has(brand)) {
    refreshing.set(brand, true)
    return
  }
  refreshing.set(brand, false)
  void settled()
    .then(() => loadBrand(brand))
    .catch(() => undefined)
    .finally(() => {
      const again = refreshing.get(brand)
      refreshing.delete(brand)
      if (again) refresh(brand)
    })
}

/** Keeps the thing a move is about to change, as the app holds it now, with its call. */
export function keep(turnId: string, callId: string, snapshot: unknown): void {
  update((c) => ({
    ...c,
    turns: c.turns.map((t) =>
      t.id === turnId
        ? { ...t, tools: t.tools.map((x) => (x.id === callId ? { ...x, snapshot } : x)) }
        : t,
    ),
  }))
}

/**
 * What Bubbles is told of the chat so far: each question and the answer it got. A move that
 * waited for the person's yes counts as an answer, so "Yes, go ahead." keeps its move. A question
 * Bubbles wrote nothing for (stopped or failed) is left out, or a fresh runtime answers it with
 * the next one.
 */
function history(turns: Turn[]): HistoryItem[] {
  return turns.flatMap((t): HistoryItem[] => {
    // All Bubbles wrote, notes too: a turn that ended on a move still records what it did.
    const said = [...(t.notes ?? []), ...t.texts]
    if (t.approval)
      said.push(
        `(${t.approval.tool} ${JSON.stringify(t.approval.input).slice(0, 500)} waits for a yes.)`,
      )
    return said.length
      ? [
          { role: 'user', text: t.question },
          { role: 'bubbles', text: said.join('\n\n') },
        ]
      : []
  })
}

/** Asks Bubbles one question: a new turn in the transcript, filled as the stream comes in. */
export async function ask(question: string): Promise<void> {
  if (chat.turns.some(running)) return
  const past = history(chat.turns).slice(-HISTORY_MAX)
  const turn = newTurn(question)
  update((c) => ({ ...c, turns: [...c.turns, turn] }))
  const mine = { id: turn.id, controller: new AbortController() }
  current = mine
  try {
    await sendTurn({
      conversation: chat.conversation,
      question,
      history: past,
      on: brand && `brand ${brand}`,
      signal: mine.controller.signal,
      onEvent: (e) => apply(turn.id, e),
    })
    // A stream that ended without `done` is over all the same.
    apply(turn.id, { name: 'done', data: {} })
  } catch {
    apply(turn.id, {
      name: 'error',
      data: { code: 'NETWORK', message: 'Bubbles could not be reached.' },
    })
  } finally {
    // A newer turn may own `current` by now (New chat, then a question): leave it alone.
    if (current === mine) current = null
  }
}

/** Ends the running turn: what came so far stays on screen. */
export function stop(): void {
  const turn = chat.turns.find(running)
  if (!turn) return
  // Closing the stream is the stop: Bubbles ends exactly that turn, never a later one.
  if (current?.id === turn.id) current.controller.abort()
  apply(turn.id, { name: 'stopped', data: {} })
}

/** Asks the last turn's question again, in its place. An earlier turn stays as it was. */
export function retry(id: string): Promise<void> {
  const last = chat.turns[chat.turns.length - 1]
  if (!last || last.id !== id || running(last)) return Promise.resolve()
  update((c) => ({ ...c, turns: c.turns.slice(0, -1) }))
  return ask(last.question)
}

/**
 * The person's yes to a send: the core records it, then Bubbles hears "Yes, go ahead." and runs
 * the move. The core's refusal, if any, comes back in words.
 */
export async function send(id: string): Promise<string | null> {
  const approval = chat.turns.find((t) => t.id === id)?.approval
  if (!approval || approval.decision !== 'waiting') return null
  // The yes must not be recorded before "go ahead" can be asked: one turn at a time.
  if (chat.turns.some(running)) return 'Wait for Bubbles to finish first.'
  // The static demo has no core to record a yes on.
  if (!remote) return 'Brand base is not connected to the core.'
  try {
    await approveMove(approval.tool, approval.input)
  } catch (err) {
    return err instanceof Error && err.message ? err.message : 'The core did not take the yes.'
  }
  decide(id, 'sent')
  void ask('Yes, go ahead.')
  return null
}

export function decide(id: string, decision: 'sent' | 'declined'): void {
  update((c) => ({
    ...c,
    turns: c.turns.map((t) =>
      t.id === id && t.approval ? { ...t, approval: { ...t.approval, decision } } : t,
    ),
  }))
}

/** A new chat: a new conversation id, and nothing in the transcript. */
export function resetChat(): void {
  current?.controller.abort()
  current = null
  update(fresh)
}
