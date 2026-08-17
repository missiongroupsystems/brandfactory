import { describe, expect, it } from 'vitest'
import { OutletSlugSchema } from './outlet'
import { OUTLET_SLUG_FALLBACK, outletSlug, uniqueOutletSlug } from './slug'

describe('outletSlug', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(outletSlug('Harbour Table')).toBe('harbour-table')
  })

  it('collapses every run of punctuation and whitespace into one hyphen', () => {
    // The em dash is the one that matters — every seeded name carries one.
    expect(outletSlug('Harbour Table — Marina')).toBe('harbour-table-marina')
    expect(outletSlug('Kopi & Co   /  Jalan Besar')).toBe('kopi-co-jalan-besar')
  })

  it('strips accents rather than dropping the letter', () => {
    expect(outletSlug('Café Крем')).toBe('cafe')
    expect(outletSlug('Ñandú Bar')).toBe('nandu-bar')
  })

  it('trims leading and trailing separators', () => {
    expect(outletSlug('  —The Quay Bar!  ')).toBe('the-quay-bar')
  })

  it('falls back rather than returning an empty segment', () => {
    expect(outletSlug('###')).toBe(OUTLET_SLUG_FALLBACK)
    expect(outletSlug('')).toBe(OUTLET_SLUG_FALLBACK)
    // Entirely non-latin: nothing survives the filter, so the fallback stands in.
    expect(outletSlug('翠玉')).toBe(OUTLET_SLUG_FALLBACK)
  })

  it('never emits a slug the schema rejects, including at the length cap', () => {
    // A truncation landing mid-word would otherwise leave a trailing hyphen.
    const long = `${'a'.repeat(99)} tail`
    const slug = outletSlug(long)
    expect(slug.length).toBeLessThanOrEqual(100)
    expect(OutletSlugSchema.safeParse(slug).success).toBe(true)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('uniqueOutletSlug', () => {
  it('returns the bare slug when it is free', () => {
    expect(uniqueOutletSlug('Casa Vostra', [])).toBe('casa-vostra')
  })

  it('numbers from 2, because the unsuffixed slug is the first one', () => {
    expect(uniqueOutletSlug('Casa Vostra', ['casa-vostra'])).toBe('casa-vostra-2')
    expect(uniqueOutletSlug('Casa Vostra', ['casa-vostra', 'casa-vostra-2'])).toBe('casa-vostra-3')
  })

  it('takes the first gap rather than the next number', () => {
    expect(uniqueOutletSlug('Casa Vostra', ['casa-vostra', 'casa-vostra-3'])).toBe('casa-vostra-2')
  })

  it('is unaffected by another outlet whose slug merely starts the same', () => {
    expect(uniqueOutletSlug('Casa', ['casa-vostra'])).toBe('casa')
  })

  it('terminates on a dense set', () => {
    const taken = ['casa', ...Array.from({ length: 40 }, (_, i) => `casa-${i + 2}`)]
    expect(uniqueOutletSlug('Casa', taken)).toBe('casa-42')
  })
})
