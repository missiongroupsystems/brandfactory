'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { CONNECTIONS, type ConnectionKey, type ConnectionStatus } from '@/data/connections'
import {
  connectSource,
  disconnectSource,
  forgetLiveBoard,
  useIdeas,
} from '@/features/ideate/ideas-store'
import { dropBoard, startPinterest } from '@/features/ideate/pinterest'
import { onState, push, remote, report, request } from '@/lib/remote'

import { NOT_SET_UP, notAvailable } from './not-available'

/**
 * Each brand's linked accounts, in memory and outside React, like `ideas-store.ts`: the
 * Connections page changes them, and the composer, the Drive picker and the call sheet read them
 * after the navigation. A reload starts over at `data/connections.ts`.
 *
 * Pinterest stays where the moodboard already keeps it, in the ideas store; this store only
 * passes it through, so the two can never disagree. On the core, Pinterest is connected once the
 * brand's own account is linked, board or not: this store keeps the account's handle from the
 * state, and the board is picked and dropped through `ideate/pinterest.ts`.
 */

export type SourceKey = ConnectionKey | 'pinterest'

type State = Record<BrandId, Record<ConnectionKey, ConnectionStatus>>

const KEYS = [
  'ig',
  'tt',
  'fb',
  'drive',
  'lark',
  'web',
  'gbp',
  'res',
] as const satisfies readonly ConnectionKey[]

/** Every source off: a brand made on the core, before its state loads. */
const OFF = Object.fromEntries(KEYS.map((k) => [k, 'off'])) as Record<
  ConnectionKey,
  ConnectionStatus
>

const initial = (): State => ({ ...CONNECTIONS })

let state: State = initial()
/** On the core: the brand's linked Pinterest account, as `@handle`. */
let pinterestNames: Partial<Record<BrandId, string>> = {}
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (remote) {
  onState((brandId, s) => {
    const rows = s.connections as { key: SourceKey; status: ConnectionStatus }[]
    // A key with no row on the server is off: the demo's seed never stands in for the server.
    const own = { ...OFF }
    for (const r of rows) {
      // Stored as connected or not, a platform not set up on our side is not trusted: it is off.
      // Pinterest's source is the ideas store's, which reads it from the same state.
      if (notAvailable(r.key) || r.key === 'pinterest') continue
      own[r.key] = r.status
    }
    state = { ...state, [brandId]: own }
    const linked = s.pinterest as { username: string } | null | undefined
    const { [brandId as BrandId]: _, ...others } = pinterestNames
    pinterestNames = linked ? { ...others, [brandId]: `@${linked.username}` } : others
    listeners.forEach((l) => l())
  })
}

const send = (brandId: BrandId, key: SourceKey, status: 'connected' | 'off') =>
  push(brandId, () => request('PUT', `/brands/${brandId}/connections/${key}`, { status }))

function set(brandId: BrandId, key: ConnectionKey, status: ConnectionStatus) {
  state = { ...state, [brandId]: { ...state[brandId], [key]: status } }
  listeners.forEach((l) => l())
}

/** Every source's status for one brand, Pinterest included. */
export function useConnections(brandId: BrandId): Record<SourceKey, ConnectionStatus> {
  const own = React.useSyncExternalStore(
    subscribe,
    () => state[brandId] ?? OFF,
    () => state[brandId] ?? OFF,
  )
  const source = useIdeas(brandId).sources.pinterest
  const linked = useAccountName(brandId, 'pinterest')
  const pinterest = remote ? linked !== null : source
  return React.useMemo(() => {
    const all: Record<SourceKey, ConnectionStatus> = {
      ...own,
      pinterest: pinterest ? 'connected' : 'off',
    }
    // On the core these are never connected, whatever was stored or seeded for them.
    for (const k of NOT_SET_UP) if (notAvailable(k)) all[k] = 'off'
    return all
  }, [own, pinterest])
}

/** The name a linked account shows under on the core (`@handle`); null in the demo. */
export function useAccountName(brandId: BrandId, key: SourceKey): string | null {
  const read = () => (key === 'pinterest' ? (pinterestNames[brandId] ?? null) : null)
  return React.useSyncExternalStore(subscribe, read, read)
}

/** True when the source works now. One that needs attention does not, until it reconnects. */
export function useConnected(brandId: BrandId, key: SourceKey): boolean {
  return useConnections(brandId)[key] === 'connected'
}

export function connect(brandId: BrandId, key: SourceKey) {
  // No pretend sign-in for a platform that cannot connect yet.
  if (notAvailable(key)) return
  if (remote && key === 'pinterest') {
    // A real sign-in: the browser leaves for Pinterest and comes back to `/connect/pinterest`,
    // then to the moodboard to pick the board.
    startPinterest(brandId).catch((err: unknown) =>
      report(err instanceof Error && err.message ? err.message : 'That did not work.'),
    )
    return
  }
  send(brandId, key, 'connected')
  if (key === 'pinterest') connectSource(brandId, 'pinterest')
  else set(brandId, key, 'connected')
}

export function disconnect(brandId: BrandId, key: SourceKey) {
  if (remote && key === 'pinterest') {
    // The account and its pins leave at once: an idea no longer finds them. The server drops its
    // only copy of the tokens.
    const { [brandId]: _, ...others } = pinterestNames
    pinterestNames = others
    forgetLiveBoard(brandId)
    disconnectSource(brandId, 'pinterest')
    push(brandId, () => dropBoard(brandId))
    listeners.forEach((l) => l())
    return
  }
  send(brandId, key, 'off')
  if (key === 'pinterest') disconnectSource(brandId, 'pinterest')
  else set(brandId, key, 'off')
}

/** For tests. */
export function resetConnections() {
  state = initial()
  pinterestNames = {}
  listeners.forEach((l) => l())
}
