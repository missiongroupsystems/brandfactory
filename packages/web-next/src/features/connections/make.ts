'use client'

/**
 * The brand's Instagram account and Facebook Page on the core. With our own Meta app on the server
 * (`GET /platforms` says `meta`), an owner or admin of the brand's company signs in with Facebook
 * and picks the brand's Page; the Page's Instagram account comes with it
 * (docs/executing/meta-direct-plan.md). Without it, they go through Make
 * (docs/executing/make-publishing-plan.md): the id and the name to show are typed, and Make holds
 * the tokens. Kept in memory outside React, like `tiktok.ts`, and filled from each brand's state.
 * The static demo never calls these.
 */

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { loadBrand, onState, platformOn, remote, request } from '@/lib/remote'

import type { TikTokVideo } from './tiktok'

export type MakeKey = 'ig' | 'fb'

export interface MakeAccount {
  name: string
  accountId: string
  /** How the account was linked: our own Meta sign-in, or typed in for Make. */
  via?: 'meta' | 'make'
}

const PLATFORM: Record<MakeKey, 'instagram' | 'facebook'> = { ig: 'instagram', fb: 'facebook' }

/**
 * True when the server posts to this platform through Make (`GET /platforms` says `instagram` or
 * `facebook`). Posting only: for the inbox and the moodboard the platform stays not set up.
 */
export const makeOn = (key: string): key is MakeKey =>
  remote && (key === 'ig' || key === 'fb') && platformOn(PLATFORM[key])

/** True when the server has our own Meta app: Instagram and Facebook connect by its sign-in. */
export const metaOn = () => remote && platformOn('meta')

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

/**
 * The brand's accounts that post Stories: Instagram and Facebook linked through our own Meta app.
 * Make posts none.
 */
export function useStoryAccounts(brandId: BrandId): MakeKey[] {
  const ig = useMakeAccount(brandId, 'ig')
  const fb = useMakeAccount(brandId, 'fb')
  return React.useMemo(
    () =>
      metaOn() ? (['ig', 'fb'] as const).filter((k) => (k === 'ig' ? ig : fb)?.via === 'meta') : [],
    [ig, fb],
  )
}

/** Links the brand's account by its id, then reloads the brand, so the composer can post to it. */
export async function linkMake(brandId: BrandId, key: MakeKey, accountId: string, name: string) {
  await request('PUT', `/brands/${brandId}/make/${PLATFORM[key]}`, { accountId, name })
  await loadBrand(brandId)
}

/**
 * The newest posts of the brand's Instagram account or Facebook Page linked through our own Meta
 * app, with their counts, read from Meta each time; nothing of them is kept. The same shape as a
 * TikTok video, so the Feed shows both in one grid.
 */
export const metaPosts = async (brandId: BrandId, key: MakeKey) =>
  (await request<{ posts: TikTokVideo[] }>('GET', `/brands/${brandId}/meta/${PLATFORM[key]}/posts`))
    .posts

/** Sends the browser to Facebook's sign-in for the brand; it comes back to `/connect/meta`. */
export async function connectMeta(brandId: BrandId) {
  const { url } = await request<{ url: string }>('POST', `/brands/${brandId}/meta/connect`)
  window.location.assign(url)
}

/** A Page the sign-in found, as the server shows it: no token. */
export interface MetaPage {
  id: string
  name: string
  igUsername: string | null
}

/** The code from Facebook's redirect: the person's Pages, and the sealed choice to pick from. */
export const finishMeta = (code: string, state: string) =>
  request<{ brandId: BrandId; choice: string; pages: MetaPage[] }>('POST', '/meta/callback', {
    code,
    state,
  })

/** Links the Page picked, with its Instagram account, then reloads the brand. */
export async function pickPage(brandId: BrandId, choice: string, pageId: string) {
  await request('POST', '/meta/select', { choice, pageId })
  await loadBrand(brandId).catch(() => undefined)
}

/**
 * Forgets the brand's account; on a refusal the brand reloads with what the server keeps. One
 * linked through Meta goes with its Page's other account: both hold the Page's token.
 */
export async function unlinkMake(brandId: BrandId, key: MakeKey) {
  const meta = accounts[brandId]?.[key]?.via === 'meta'
  const { [key]: _, ...rest } = accounts[brandId] ?? {}
  accounts = { ...accounts, [brandId]: rest }
  changed()
  try {
    await request(
      'DELETE',
      meta ? `/brands/${brandId}/meta` : `/brands/${brandId}/make/${PLATFORM[key]}`,
    )
  } finally {
    await loadBrand(brandId).catch(() => undefined)
  }
}

/** For tests. */
export function resetMake() {
  accounts = {}
  changed()
}
