'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { CONNECTIONS, type ConnectionKey, type ConnectionStatus } from '@/data/connections'
import { connectSource, disconnectSource, useIdeas } from '@/features/ideate/ideas-store'

/**
 * Each brand's linked accounts, in memory and outside React, like `ideas-store.ts`: the
 * Connections page changes them, and the composer, the Drive picker and the call sheet read them
 * after the navigation. A reload starts over at `data/connections.ts`.
 *
 * Pinterest stays where the moodboard already keeps it, in the ideas store; this store only
 * passes it through, so the two can never disagree.
 */

export type SourceKey = ConnectionKey | 'pinterest'

type State = Record<BrandId, Record<ConnectionKey, ConnectionStatus>>

const initial = (): State => ({ ...CONNECTIONS })

let state: State = initial()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

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
  const pinterest = useIdeas(brandId).sources.pinterest
  return React.useMemo(
    () => ({ ...own, pinterest: pinterest ? 'connected' : 'off' }),
    [own, pinterest],
  )
}

/** True when the source works now. One that needs attention does not, until it reconnects. */
export function useConnected(brandId: BrandId, key: SourceKey): boolean {
  return useConnections(brandId)[key] === 'connected'
}

export function connect(brandId: BrandId, key: SourceKey) {
  if (key === 'pinterest') connectSource(brandId, 'pinterest')
  else set(brandId, key, 'connected')
}

export function disconnect(brandId: BrandId, key: SourceKey) {
  if (key === 'pinterest') disconnectSource(brandId, 'pinterest')
  else set(brandId, key, 'off')
}

/** For tests. */
export function resetConnections() {
  state = initial()
  listeners.forEach((l) => l())
}
