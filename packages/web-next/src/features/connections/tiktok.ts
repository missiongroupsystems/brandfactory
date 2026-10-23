'use client'

/**
 * The brand's own TikTok account on the core, upload only: TikTok's sign-in, the linked account
 * (its name and picture), and planned video posts sent to the account's TikTok inbox as drafts,
 * which the team finishes in the TikTok app. Nothing is posted from Brand Base. Kept in memory
 * outside React, like `connections-store.ts`, and filled from each brand's state. The static demo
 * never calls these.
 */

import * as React from 'react'

import type { BrandId } from '@/data/brands'
import { loadBrand, onState, platformOn, remote, request } from '@/lib/remote'

export interface TikTokAccount {
  name: string
  avatar: string | null
}

export interface TikTokSend {
  postId: string
  status: 'uploading' | 'processing' | 'sent' | 'failed'
  reason: string | null
  updatedAt: string
}

/** True when the server has the TikTok app set up (`GET /platforms`). */
export const tiktokOn = () => remote && platformOn('tiktok')

let accounts: Partial<Record<BrandId, TikTokAccount>> = {}
let sends: Partial<Record<BrandId, Record<string, TikTokSend>>> = {}
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
    const account = s.tiktok as TikTokAccount | null | undefined
    const { [brandId as BrandId]: _, ...others } = accounts
    accounts = account ? { ...others, [brandId]: account } : others
    const rows = (s.tiktokSends ?? []) as TikTokSend[]
    sends = { ...sends, [brandId]: Object.fromEntries(rows.map((r) => [r.postId, r])) }
    changed()
  })
}

function keep(brandId: BrandId, send: TikTokSend) {
  sends = { ...sends, [brandId]: { ...sends[brandId], [send.postId]: send } }
  changed()
}

/** The brand's linked TikTok account, or null. */
export function useTikTokAccount(brandId: BrandId): TikTokAccount | null {
  const read = () => accounts[brandId] ?? null
  return React.useSyncExternalStore(subscribe, read, read)
}

/** A post's latest send to the TikTok inbox, or null. */
export function useTikTokSend(brandId: BrandId, postId: string | undefined): TikTokSend | null {
  const read = () => (postId ? (sends[brandId]?.[postId] ?? null) : null)
  return React.useSyncExternalStore(subscribe, read, read)
}

/** Sends the browser to TikTok's sign-in; it comes back to `/connect/tiktok`. */
export async function connectTikTok(brandId: BrandId) {
  const { url } = await request<{ url: string }>('POST', `/brands/${brandId}/tiktok/connect`)
  window.location.assign(url)
}

/** The end of the sign-in: the brand it started from. */
export const finishTikTok = (code: string, state: string) =>
  request<{ brandId: BrandId; name: string }>('POST', '/tiktok/callback', { code, state })

/** Forgets the brand's account: the server revokes the grant and drops its only copy. */
export async function disconnectTikTok(brandId: BrandId) {
  const { [brandId]: _, ...others } = accounts
  accounts = others
  changed()
  try {
    await request('DELETE', `/brands/${brandId}/tiktok`)
  } catch (err) {
    // The server may still hold the account: the brand reloads with what it stores.
    await loadBrand(brandId).catch(() => undefined)
    throw err
  }
}

/** How often the page asks how a send stands, and for how long. */
const POLL_MS = 4000
const POLL_FOR_MS = 3 * 60 * 1000
const NOT_CONFIRMED =
  'TikTok has not confirmed the draft yet. Check the TikTok inbox, or send it again.'

/**
 * Sends a planned video post to the brand's TikTok inbox, then asks how it stands until TikTok has
 * it in the inbox or says no. A refusal before the upload (no video, a send on its way) throws.
 */
export async function sendToTikTok(brandId: BrandId, postId: string) {
  keep(brandId, {
    postId,
    status: 'uploading',
    reason: null,
    updatedAt: new Date().toISOString(),
  })
  let send: TikTokSend
  try {
    send = await request<TikTokSend>('POST', `/brands/${brandId}/posts/${postId}/tiktok`)
  } catch (err) {
    const { [postId]: _, ...rest } = sends[brandId] ?? {}
    sends = { ...sends, [brandId]: rest }
    changed()
    throw err
  }
  keep(brandId, send)
  return follow(brandId, send)
}

/** The sends the page is asking about now, so one send is asked about once. */
const following = new Set<string>()

/** Asks how a send TikTok is processing stands, until TikTok has it in the inbox or says no. */
export async function follow(brandId: BrandId, send: TikTokSend): Promise<TikTokSend> {
  const key = `${brandId}/${send.postId}`
  if (send.status !== 'processing' || following.has(key)) return send
  following.add(key)
  try {
    const until = Date.now() + POLL_FOR_MS
    while (send.status === 'processing' && Date.now() < until) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      try {
        send = await request<TikTokSend>('GET', `/brands/${brandId}/posts/${send.postId}/tiktok`)
      } catch (err) {
        send = { ...send, status: 'failed', reason: err instanceof Error ? err.message : null }
      }
      keep(brandId, send)
    }
    if (send.status === 'processing') {
      // TikTok has the file but has not said the draft is in the inbox. The server lets the post
      // go again after the same three minutes.
      send = { ...send, status: 'failed', reason: NOT_CONFIRMED }
      keep(brandId, send)
    }
    return send
  } finally {
    following.delete(key)
  }
}

/** For tests. */
export function resetTikTok() {
  accounts = {}
  sends = {}
  changed()
}
