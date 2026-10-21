'use client'

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { CONNECTIONS, type ConnectionKey, type ConnectionStatus } from '@/data/connections'
import { showBoards } from '@/data/ideas'
import { connectSource, disconnectSource, useIdeas } from '@/features/ideate/ideas-store'
import { dropBoard } from '@/features/ideate/pinterest'
import { onState, push, remote, report, request } from '@/lib/remote'

import { forgetAccount, isPublishing, startSignIn, type PublishingKey } from './accounts'

/**
 * Each brand's linked accounts, in memory and outside React, like `ideas-store.ts`: the
 * Connections page changes them, and the composer, the Drive picker and the call sheet read them
 * after the navigation. A reload starts over at `data/connections.ts`.
 *
 * Pinterest stays where the moodboard already keeps it, in the ideas store; this store only
 * passes it through, so the two can never disagree. On the API, Pinterest is connected once the
 * brand's own account is linked, board or not: this store keeps the account's handle from the
 * state, and the board is set and dropped through `ideate/pinterest.ts`.
 *
 * On the API, Instagram, Facebook and TikTok are real sign-ins (`accounts.ts`): their status comes
 * from the server, which turns them on with the linked accounts, and this store keeps the names
 * the accounts show under. Instagram and Facebook are one Meta account, so they go together.
 */

export type SourceKey = ConnectionKey | 'pinterest'

type State = Record<BrandId, Record<ConnectionKey, ConnectionStatus>>

const initial = (): State => ({ ...CONNECTIONS })

let state: State = initial()
type Named = 'pinterest' | PublishingKey
/** On the API: the name each linked account shows under, per brand. */
let names: Partial<Record<BrandId, Partial<Record<Named, string>>>> = {}
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
    const meta = s.meta as { page: string; igUsername: string | null } | null | undefined
    names = {
      ...names,
      [brandId]: {
        ...(s.pinterest && { pinterest: `@${s.pinterest.username as string}` }),
        ...(meta && { fb: meta.page }),
        ...(meta?.igUsername && { ig: `@${meta.igUsername}` }),
        ...(s.tiktok && { tt: s.tiktok.username as string }),
      },
    }
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
  const linked = useAccountName(brandId, 'pinterest')
  const source = useIdeas(brandId).sources.pinterest
  const pinterest = remote ? linked !== null : source
  return React.useMemo(
    () => ({ ...own, pinterest: pinterest ? 'connected' : 'off' }),
    [own, pinterest],
  )
}

/** The name a linked account shows under on the API (`@handle`, the Page); null in the demo. */
export function useAccountName(brandId: BrandId, key: SourceKey): string | null {
  const read = () => names[brandId]?.[key as Named] ?? null
  return React.useSyncExternalStore(subscribe, read, read)
}

function forget(brandId: BrandId, keys: Named[]) {
  const kept = { ...names[brandId] }
  for (const k of keys) delete kept[k]
  names = { ...names, [brandId]: kept }
  listeners.forEach((l) => l())
}

/** True when the source works now. One that needs attention does not, until it reconnects. */
export function useConnected(brandId: BrandId, key: SourceKey): boolean {
  return useConnections(brandId)[key] === 'connected'
}

export function connect(brandId: BrandId, key: SourceKey) {
  if (key === 'pinterest') connectSource(brandId, 'pinterest')
  else if (remote && isPublishing(key)) {
    // A real sign-in: the browser leaves for the platform and comes back to `/connect/...`.
    startSignIn(brandId, key).catch((err: unknown) =>
      report(err instanceof Error ? err.message : 'That did not work.'),
    )
  } else {
    send(brandId, key, 'connected')
    set(brandId, key, 'connected')
  }
}

export function disconnect(brandId: BrandId, key: SourceKey) {
  if (key === 'pinterest') {
    disconnectSource(brandId, 'pinterest')
    if (remote) {
      // The account and its pins leave at once: an idea no longer finds them.
      forget(brandId, ['pinterest'])
      showBoards(brandId, [])
      push(brandId, () => dropBoard(brandId))
    }
  } else if (remote && isPublishing(key)) {
    // Instagram and Facebook are one Page on Meta: forgetting one forgets both.
    const gone: PublishingKey[] = key === 'tt' ? ['tt'] : ['ig', 'fb']
    for (const k of gone) set(brandId, k, 'off')
    forget(brandId, gone)
    push(brandId, () => forgetAccount(brandId, key))
  } else {
    send(brandId, key, 'off')
    set(brandId, key, 'off')
  }
}

/** For tests. */
export function resetConnections() {
  state = initial()
  names = {}
  listeners.forEach((l) => l())
}
