/**
 * The moodboard's Pinterest source on the API: the brand's own Pinterest account, the one board on
 * it the moodboard reads, and that board's pins read live (the server keeps no pin). The static
 * demo never calls these.
 */

import { contentFor, type BrandId } from '@/data/brands'
import type { Board, Reference } from '@/data/ideas'
import { loadBrand, request } from '@/lib/remote'

export interface PinterestSetup {
  account: { username: string } | null
  boards: Array<{
    id: string
    name: string
    pinCount: number
    cover: string | null
    /** The board the brand's moodboard reads now. */
    picked: boolean
  }>
}

interface Pin {
  id: string
  title: string
  link: string | null
  image: string
  width: number
  height: number
}

export const pinterestSetup = (brandId: BrandId) =>
  request<PinterestSetup>('GET', `/brands/${brandId}/pinterest`)

/** Sends the browser to Pinterest; it comes back to `/connect/pinterest`. */
export async function startPinterest(brandId: BrandId) {
  const { url } = await request<{ url: string }>('POST', `/brands/${brandId}/pinterest/connect`)
  window.location.assign(url)
}

/** The end of the sign-in: the brand it started from, to open again. */
export const finishPinterest = (code: string, state: string) =>
  request<{ brandId: BrandId; username: string }>('POST', '/pinterest/callback', { code, state })

/** This brand reads the board from now on; the brand reloads, which loads the pins. */
export async function pickBoard(brandId: BrandId, boardId: string) {
  await request('PUT', `/brands/${brandId}/pinterest`, { boardId })
  await loadBrand(brandId)
}

/** Forgets the brand's account and its board: the server drops its only copy of the tokens. */
export const dropBoard = (brandId: BrandId) => request('DELETE', `/brands/${brandId}/pinterest`)

/** A pin as the moodboard shows it, with the idea it would start. */
function referenceOf(board: string, pin: Pin, brandName: string): Reference {
  const borrow = pin.title || 'Say what to borrow.'
  return {
    id: `pin-${pin.id}`,
    platform: 'pinterest',
    account: board,
    image: pin.image,
    ratio: pin.width ? pin.height / pin.width : undefined,
    borrow,
    seed: {
      format: 'reel',
      pillar: 'Craft',
      hook: pin.title || 'New idea from a pin.',
      angle: 'Shoot it like the pin.',
      feature: brandName,
      shots: [],
      sharper: [],
    },
  }
}

/** The brand's board with its pins, as one folder on the moodboard. */
export async function loadBoard(brandId: BrandId): Promise<Board> {
  const { board, pins } = await request<{ board: { id: string; name: string }; pins: Pin[] }>(
    'GET',
    `/brands/${brandId}/pinterest/pins`,
  )
  const brandName = contentFor(brandId).brand.name
  const refs = pins.map((p) => referenceOf(board.name, p, brandName))
  return {
    id: `board-${board.id}`,
    name: board.name,
    pinCount: refs.length,
    covers: refs.slice(0, 4).map((r) => r.image),
    pins: refs,
  }
}
