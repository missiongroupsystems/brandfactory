'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { CONNECTIONS, type ConnectionKey, type ConnectionStatus } from '@/data/connections'
import { connectSource, disconnectSource, useIdeas } from '@/features/ideate/ideas-store'
import { onState, push, remote, request } from '@/lib/remote'

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
      if (r.key === 'pinterest') {
        if (r.status === 'connected') connectSource(brandId as BrandId, 'pinterest')
        else disconnectSource(brandId as BrandId, 'pinterest')
      } else own[r.key] = r.status
    }
    state = { ...state, [brandId]: own }
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
  send(brandId, key, 'connected')
  if (key === 'pinterest') connectSource(brandId, 'pinterest')
  else set(brandId, key, 'connected')
}

export function disconnect(brandId: BrandId, key: SourceKey) {
  send(brandId, key, 'off')
  if (key === 'pinterest') disconnectSource(brandId, 'pinterest')
  else set(brandId, key, 'off')
}

/** For tests. */
export function resetConnections() {
  state = initial()
  listeners.forEach((l) => l())
}
