import { describe, expect, it } from 'vitest'

import type { BrandId } from './brands'
import {
  coverOf,
  IDEAS_BY_BRAND,
  inspirationOf,
  pasteReference,
  referenceById,
  type Reference,
} from './ideas'
import { INSIGHTS_BY_BRAND } from './insights'

const brands = Object.keys(IDEAS_BY_BRAND) as BrandId[]

describe('the ideas data', () => {
  it('gives every idea, suggestion, moment and insight idea of every brand its inspiration posts', () => {
    for (const brandId of brands) {
      const { ideas, moments } = IDEAS_BY_BRAND[brandId]
      const seeds = [
        ...ideas,
        ...moments.map((m) => ({ id: m.id, ...m.seed })),
        ...INSIGHTS_BY_BRAND[brandId].stories.flatMap((s) =>
          s.idea ? [{ id: `${s.id} → idea`, ...s.idea }] : [],
        ),
      ]
      for (const seed of seeds) {
        // Two to four posts: enough to read as a moodboard, few enough to fit on a card.
        expect(seed.inspiration.length, seed.id).toBeGreaterThanOrEqual(2)
        expect(seed.inspiration.length, seed.id).toBeLessThanOrEqual(4)
        // Each one is a post of this brand, on its shelf or on one of its boards.
        for (const id of seed.inspiration) {
          expect(referenceById(brandId, id), `${seed.id} → ${id}`).toBeDefined()
        }
      }
    }
  })

  it('shows every idea with a photo: its own, or else its first inspiration post’s', () => {
    for (const brandId of brands) {
      for (const card of IDEAS_BY_BRAND[brandId].ideas) {
        const cover = coverOf(brandId, card)
        expect(cover, card.id).toBeTruthy()
        if (card.image) expect(cover).toBe(card.image)
        else expect(cover).toBe(inspirationOf(brandId, card)[0]!.image)
      }
    }
  })

  it('keeps the posts in the order they were picked, and skips an id it cannot find', () => {
    const card = { inspiration: ['cv-p-5', 'nowhere', 'cv-r-dough'] }
    expect(inspirationOf('casa-vostra', card).map((r) => r.id)).toEqual(['cv-p-5', 'cv-r-dough'])
  })

  it('keeps a pasted link as a post of its brand only, and looks past it for a cover photo', () => {
    const link: Reference = {
      id: 'pasted-1',
      platform: 'ig',
      account: 'instagram.com',
      image: '',
      borrow: 'Say what to borrow.',
      seed: IDEAS_BY_BRAND.temper.references[0]!.seed,
    }
    pasteReference('temper', link)
    expect(referenceById('temper', 'pasted-1')).toBe(link)
    expect(referenceById('carlitos', 'pasted-1')).toBeUndefined()
    const card = { inspiration: ['pasted-1', 'tp-p-3'] }
    expect(inspirationOf('temper', card).map((r) => r.id)).toEqual(['pasted-1', 'tp-p-3'])
    expect(coverOf('temper', card)).toBe(referenceById('temper', 'tp-p-3')!.image)
  })
})
