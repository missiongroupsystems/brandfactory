'use client'

/**
 * The brand's Instagram account and Facebook Page on the core, posted to through Make until our
 * own Meta app passes review (docs/executing/make-publishing-plan.md). An owner or admin of the
 * brand's company types each id and the name to show; Make holds the tokens. Kept in memory outside
 * React, like `tiktok.ts`, and filled from each brand's state. The static demo never calls these.
 */

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { loadBrand, onState, platformOn, remote, request } from '@/lib/remote'

export type MakeKey = 'ig' | 'fb'

export interface MakeAccount {
  name: string
  accountId: string
}

const PLATFORM: Record<MakeKey, 'instagram' | 'facebook'> = { ig: 'instagram', fb: 'facebook' }

/**
 * True when the server posts to this platform through Make (`GET /platforms` says `instagram` or
 * `facebook`). Posting only: for the inbox and the moodboard the platform stays not set up.
 */
export const makeOn = (key: string): key is MakeKey =>
  remote && (key === 'ig' || key === 'fb') && platformOn(PLATFORM[key])

let accounts: Partial<Record<BrandId, Partial<Record<MakeKey, MakeAccount>>>> = {}
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (remote) {
  onState((brandId, s) => {
    const ig = s.instagram as MakeAccount | null | undefined
    const fb = s.facebook as MakeAccount | null | undefined
    accounts = { ...accounts, [brandId]: { ...(ig && { ig }), ...(fb && { fb }) } }
    changed()
  })
}

/** The brand's linked account on Instagram or Facebook, or null. */
export function useMakeAccount(brandId: BrandId, key: MakeKey): MakeAccount | null {
  const read = () => accounts[brandId]?.[key] ?? null
  return React.useSyncExternalStore(subscribe, read, read)
}

/** Links the brand's account by its id, then reloads the brand, so the composer can post to it. */
export async function linkMake(brandId: BrandId, key: MakeKey, accountId: string, name: string) {
  await request('PUT', `/brands/${brandId}/make/${PLATFORM[key]}`, { accountId, name })
  await loadBrand(brandId)
}

/** Forgets the brand's account; on a refusal the brand reloads with what the server keeps. */
export async function unlinkMake(brandId: BrandId, key: MakeKey) {
  const { [key]: _, ...rest } = accounts[brandId] ?? {}
  accounts = { ...accounts, [brandId]: rest }
  changed()
  try {
    await request('DELETE', `/brands/${brandId}/make/${PLATFORM[key]}`)
  } finally {
    await loadBrand(brandId).catch(() => undefined)
  }
}

/** For tests. */
export function resetMake() {
  accounts = {}
  changed()
}
