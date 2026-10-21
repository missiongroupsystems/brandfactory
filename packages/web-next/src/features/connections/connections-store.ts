'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { CONNECTIONS, type ConnectionKey, type ConnectionStatus } from '@/data/connections'
import { showBoards } from '@/data/ideas'
import { connectSource, disconnectSource, useIdeas } from '@/features/ideate/ideas-store'
import { dropBoard } from '@/features/ideate/pinterest'
import { onState, push, remote, request } from '@/lib/remote'

/**
 * Each brand's linked accounts, in memory and outside React, like `ideas-store.ts`: the
 * Connections page changes them, and the composer, the Drive picker and the call sheet read them
 * after the navigation. A reload starts over at `data/connections.ts`.
 *
 * Pinterest stays where the moodboard already keeps it, in the ideas store; this store only
 * passes it through, so the two can never disagree. On the API, Pinterest is connected once the
 * brand's own account is linked, board or not: this store keeps the account's handle from the
 * state, and the board is set and dropped through `ideate/pinterest.ts`.
 */

export type SourceKey = ConnectionKey | 'pinterest'

type State = Record<BrandId, Record<ConnectionKey, ConnectionStatus>>

const initial = (): State => ({ ...CONNECTIONS })

let state: State = initial()
/** On the API: each brand's linked Pinterest handle, or null. */
let handles: Partial<Record<BrandId, string | null>> = {}
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
    const own = Object.fromEntries(
      Object.keys(state[brandId as BrandId]).map((k) => [k, 'off']),
    ) as Record<ConnectionKey, ConnectionStatus>
    for (const r of rows) if (r.key !== 'pinterest') own[r.key] = r.status
    state = { ...state, [brandId]: own }
    handles = { ...handles, [brandId]: (s.pinterest?.username as string | undefined) ?? null }
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
    () => state[brandId],
    () => state[brandId],
  )
  const handle = usePinterestHandle(brandId)
  const source = useIdeas(brandId).sources.pinterest
  const pinterest = remote ? handle !== null : source
  return React.useMemo(
    () => ({ ...own, pinterest: pinterest ? 'connected' : 'off' }),
    [own, pinterest],
  )
}

/** The brand's linked Pinterest account on the API, as its handle; null in the demo. */
export function usePinterestHandle(brandId: BrandId): string | null {
  return React.useSyncExternalStore(
    subscribe,
    () => handles[brandId] ?? null,
    () => handles[brandId] ?? null,
  )
}

/** True when the source works now. One that needs attention does not, until it reconnects. */
export function useConnected(brandId: BrandId, key: SourceKey): boolean {
  return useConnections(brandId)[key] === 'connected'
}

export function connect(brandId: BrandId, key: SourceKey) {
  if (key === 'pinterest') connectSource(brandId, 'pinterest')
  else {
    send(brandId, key, 'connected')
    set(brandId, key, 'connected')
  }
}

export function disconnect(brandId: BrandId, key: SourceKey) {
  if (key === 'pinterest') {
    disconnectSource(brandId, 'pinterest')
    if (remote) {
      // The account and its pins leave at once: an idea no longer finds them.
      handles = { ...handles, [brandId]: null }
      listeners.forEach((l) => l())
      showBoards(brandId, [])
      push(brandId, () => dropBoard(brandId))
    }
  } else {
    send(brandId, key, 'off')
    set(brandId, key, 'off')
  }
}

/** For tests. */
export function resetConnections() {
  state = initial()
  handles = {}
  listeners.forEach((l) => l())
}
