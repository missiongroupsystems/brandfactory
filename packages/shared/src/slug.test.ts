import { describe, expect, it } from 'vitest'
import { OUTLET_SLUG_FALLBACK, outletSlug, uniqueOutletSlug } from './outlet/slug'
import { SlugSchema, slugify, uniqueSlug } from './slug'

// This file was `outlet/slug.test.ts` and moved with the rule it covers. Every
// case it had is still here, still stated in outlet names, because the outlet
// wrappers are the reason the generic pair has to keep behaving exactly as it
// did — a change to `slugify` breaks URLs that are already written down.

describe('slugify', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(slugify('Harbour Table', 'outlet')).toBe('harbour-table')
  })

  it('collapses every run of punctuation and whitespace into one hyphen', () => {
    // The em dash is the one that matters — every seeded name carries one.
    expect(slugify('Harbour Table — Marina', 'outlet')).toBe('harbour-table-marina')
    expect(slugify('Kopi & Co   /  Jalan Besar', 'outlet')).toBe('kopi-co-jalan-besar')
  })

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Café Крем', 'outlet')).toBe('cafe')
    expect(slugify('Ñandú Bar', 'outlet')).toBe('nandu-bar')
  })

  it('trims leading and trailing separators', () => {
    expect(slugify('  —The Quay Bar!  ', 'outlet')).toBe('the-quay-bar')
  })

  it('falls back rather than returning an empty segment', () => {
    expect(slugify('###', 'outlet')).toBe('outlet')
    expect(slugify('', 'outlet')).toBe('outlet')
    // Entirely non-latin: nothing survives the filter, so the fallback stands in.
    expect(slugify('翠玉', 'outlet')).toBe('outlet')
  })

  it('uses the fallback it was given, not one of its own', () => {
    // The parameter exists so a creator with an unusable handle never becomes
    // `outlet-2`.
    expect(slugify('小红书', 'creator')).toBe('creator')
  })

  it('never emits a slug the schema rejects, including at the length cap', () => {
    // A truncation landing mid-word would otherwise leave a trailing hyphen.
    const long = `${'a'.repeat(99)} tail`
    const slug = slugify(long, 'outlet')
    expect(slug.length).toBeLessThanOrEqual(100)
    expect(SlugSchema.safeParse(slug).success).toBe(true)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('returns the bare slug when it is free', () => {
    expect(uniqueSlug('casa-vostra', [])).toBe('casa-vostra')
  })

  it('numbers from 2, because the unsuffixed slug is the first one', () => {
    expect(uniqueSlug('casa-vostra', ['casa-vostra'])).toBe('casa-vostra-2')
    expect(uniqueSlug('casa-vostra', ['casa-vostra', 'casa-vostra-2'])).toBe('casa-vostra-3')
  })

  it('takes the first gap rather than the next number', () => {
    expect(uniqueSlug('casa-vostra', ['casa-vostra', 'casa-vostra-3'])).toBe('casa-vostra-2')
  })

  it('is unaffected by another slug that merely starts the same', () => {
    expect(uniqueSlug('casa', ['casa-vostra'])).toBe('casa')
  })

  it('terminates on a dense set', () => {
    const taken = ['casa', ...Array.from({ length: 40 }, (_, i) => `casa-${i + 2}`)]
    expect(uniqueSlug('casa', taken)).toBe('casa-42')
  })
})

describe('outletSlug', () => {
  it('is slugify with the outlet fallback, and nothing else', () => {
    expect(outletSlug('Harbour Table — Marina')).toBe('harbour-table-marina')
    expect(outletSlug('###')).toBe(OUTLET_SLUG_FALLBACK)
    expect(OUTLET_SLUG_FALLBACK).toBe('outlet')
  })
})

describe('uniqueOutletSlug', () => {
  it('still takes a name rather than a base, and still numbers from 2', () => {
    // The wrapper does the slugifying. A caller that had to slugify first would
    // be a caller that could get the fallback wrong.
    expect(uniqueOutletSlug('Casa Vostra', ['casa-vostra'])).toBe('casa-vostra-2')
  })
})
