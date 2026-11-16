'use client'

import * as React from 'react'

import { remote, request } from '@/lib/remote'

import { namesIn } from './model'

/**
 * Whether Instagram can tag or invite an account, as the server reads it from Business Discovery
 * (`GET /brands/:b/instagram/accounts/:handle`): `confirmed` (a business or creator account,
 * public), `unconfirmed` (personal, private or misspelled) or `unknown` (Meta did not say). Asked
 * once per brand and name in this tab, and only on the core.
 */
type Status = 'confirmed' | 'unconfirmed' | 'unknown'

const seen = new Map<string, Status | 'asking'>()
const listeners = new Set<() => void>()
let version = 0

const keyOf = (brandId: string, handle: string) => `${brandId}|${handle.toLowerCase()}`

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function ask(brandId: string, handle: string) {
  const key = keyOf(brandId, handle)
  if (seen.has(key)) return
  seen.set(key, 'asking')
  const name = handle.replace(/^@/, '')
  request<{ status: Status }>(
    'GET',
    `/brands/${brandId}/instagram/accounts/${encodeURIComponent(name)}`,
  )
    .then(
      (r) => seen.set(key, r.status),
      // Not read (offline, Meta down, Instagram not linked yet): no line, and the field asks
      // again the next time it opens.
      () => seen.delete(key),
    )
    .finally(() => {
      version++
      listeners.forEach((l) => l())
    })
}

/** The accounts among `handles` that Instagram could not confirm as public. */
export function useUnconfirmed(brandId: string, handles: string[]): string[] {
  const at = React.useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  )
  const list = handles.join(' ')
  React.useEffect(() => {
    if (!remote) return
    for (const h of list.split(' ').filter(Boolean)) ask(brandId, h)
  }, [brandId, list])
  return React.useMemo(
    () => handles.filter((h) => seen.get(keyOf(brandId, h)) === 'unconfirmed'),
    // `at` changes when an answer lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandId, list, at],
  )
}

/** Forgets every answer, for the tests. */
export function resetAccountChecks() {
  seen.clear()
  version++
}

/**
 * One quiet line under a field when an account in it may not take a tag or an invite: Instagram's
 * API reaches public accounts only, and it cannot say an account is private, only that it could
 * not find it as a business or creator account. Nothing when every account is confirmed.
 */
export function PublicNote({ brandId, handles }: { brandId: string; handles: string[] }) {
  const unconfirmed = useUnconfirmed(brandId, handles)
  if (unconfirmed.length === 0) return null
  return (
    <p className="text-[12.5px] leading-[1.45] text-ink-3 max-md:text-[13.5px]">
      Instagram tags and invites public accounts only. We could not confirm {namesIn(unconfirmed)}{' '}
      {unconfirmed.length === 1 ? 'is' : 'are'} public.
    </p>
  )
}
