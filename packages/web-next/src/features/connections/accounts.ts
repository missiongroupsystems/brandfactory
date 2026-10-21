/**
 * The publishing accounts on the API: a brand's Facebook Page (with its Instagram account) and its
 * TikTok account, linked by a real sign-in. The static demo never calls these.
 */

import type { BrandId } from '@/data/brands'
import { request } from '@/lib/remote'

export type PublishingKey = 'ig' | 'fb' | 'tt'

export const isPublishing = (key: string): key is PublishingKey =>
  key === 'ig' || key === 'fb' || key === 'tt'

/** Instagram and Facebook come from one Meta sign-in: the Page and its Instagram account. */
export const platformOf = (key: PublishingKey) => (key === 'tt' ? 'tiktok' : 'meta')

const RETURN_KEY = 'brandbase.signInFrom'

/**
 * Sends the browser to the platform's sign-in; it comes back to `/connect/<platform>`, and from
 * there to the page it left (`signInReturn`), such as the post being retried.
 */
export async function startSignIn(brandId: BrandId, key: PublishingKey) {
  const { url } = await request<{ url: string }>(
    'POST',
    `/brands/${brandId}/${platformOf(key)}/connect`,
  )
  try {
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search)
  } catch {
    // Private mode: the sign-in comes back to Connections instead.
  }
  window.location.assign(url)
}

/** The page the sign-in left from, once; Connections when it is not known. */
export function signInReturn(): string {
  let from: string | null = null
  try {
    from = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // Private mode.
  }
  // Only a path on this site: never a full address.
  return from && from.startsWith('/') && !from.startsWith('//') ? from : '/brand/connections'
}

export interface PageChoice {
  brandId: BrandId
  /** The person's Pages, sealed by the server; sent back with the one picked. */
  choice: string
  pages: Array<{ id: string; name: string; igUsername: string | null }>
}

export const finishMeta = (code: string, state: string) =>
  request<PageChoice>('POST', '/meta/callback', { code, state })

export const pickPage = (choice: string, pageId: string) =>
  request<{ brandId: BrandId; page: string; igUsername: string | null }>('POST', '/meta/select', {
    choice,
    pageId,
  })

export const finishTikTok = (code: string, state: string) =>
  request<{ brandId: BrandId; username: string }>('POST', '/tiktok/callback', { code, state })

/** Forgets the brand's account at that platform: for Meta, the Page and its Instagram account. */
export const forgetAccount = (brandId: BrandId, key: PublishingKey) =>
  request('DELETE', `/brands/${brandId}/${platformOf(key)}`)
