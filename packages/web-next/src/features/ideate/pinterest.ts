/**
 * The moodboard’s Pinterest source on the core: the brand's own Pinterest account, the boards on
 * it the moodboard reads, and their pins read live (the server keeps no pin). The static demo
 * never calls these.
 */

import type { BrandId } from '@/data/brands'
import type { Board, Reference } from '@/data/ideas'
import { request } from '@/lib/remote'

export interface PinterestSetup {
  account: { username: string } | null
  boards: Array<{
    id: string
    name: string
    pinCount: number
    cover: string | null
    /** The board on pinterest.com. */
    url: string
    /** One of the boards the brand's moodboard reads now. */
    picked: boolean
  }>
}

/** The most boards one moodboard reads, as the server allows. */
export const MAX_BOARDS = 5

interface Pin {
  id: string
  title: string
  link: string | null
  image: string
  width: number
  height: number
}

/** The setup read last this page load, per brand, so the picker opens on it at once. */
const setups = new Map<BrandId, PinterestSetup>()
const asking = new Map<BrandId, Promise<PinterestSetup>>()

/** The brand's account and boards; one read at a time per brand. */
export function pinterestSetup(brandId: BrandId) {
  const already = asking.get(brandId)
  if (already) return already
  // A read a change of boards overtook (`pickBoards`) neither keeps its answer nor ends a newer one.
  const read = request<PinterestSetup>('GET', `/brands/${brandId}/pinterest`)
    .then((s) => {
      if (asking.get(brandId) === read) setups.set(brandId, s)
      return s
    })
    .finally(() => {
      if (asking.get(brandId) === read) asking.delete(brandId)
    })
  asking.set(brandId, read)
  return read
}

export const knownSetup = (brandId: BrandId) => setups.get(brandId)

/** Sends the browser to Pinterest; it comes back to `/connect/pinterest`. */
export async function startPinterest(brandId: BrandId) {
  const { url } = await request<{ url: string }>('POST', `/brands/${brandId}/pinterest/connect`)
  window.location.assign(url)
}

/** The end of the sign-in: the brand it started from, to open again. */
export const finishPinterest = (code: string, state: string) =>
  request<{ brandId: BrandId; username: string }>('POST', '/pinterest/callback', { code, state })

/**
 * This brand reads these boards from now on, in this order; none turns Pinterest off and keeps the
 * account. `saveBoards` in the ideas store also reads them afresh.
 */
export function pickBoards(brandId: BrandId, boardIds: string[]) {
  // A read already on its way answers with the old boards: the next open reads afresh.
  asking.delete(brandId)
  return request('PUT', `/brands/${brandId}/pinterest`, { boardIds })
}

/** The Pinterest id of a board the moodboard shows (`board-<id>`). */
export const pinterestIdOf = (board: Pick<Board, 'id'>) => board.id.replace(/^board-/, '')

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

/** The brand's boards with their pins, each one folder on the moodboard, in the order picked. */
export async function loadBoards(brandId: BrandId, brandName: string): Promise<Board[]> {
  const { boards } = await request<{
    boards: Array<{ id: string; name: string; url: string; pins: Pin[] }>
  }>('GET', `/brands/${brandId}/pinterest/pins`)
  return boards.map((board) => {
    const refs = board.pins.map((p) => referenceOf(board.name, p, brandName))
    return {
      id: `board-${board.id}`,
      name: board.name,
      url: board.url,
      pinCount: refs.length,
      covers: refs.slice(0, 4).map((r) => r.image),
      pins: refs,
    }
  })
}
