import { describe, expect, it } from 'vitest'
import type { ProseMirrorDoc } from '../json'
import {
  TLDR_SECTION_KEY,
  brandDescriptionLine,
  brandTldrLine,
  sectionBodyToLine,
} from './description-line'

const doc = (content: unknown[]): ProseMirrorDoc => ({ type: 'doc', content }) as ProseMirrorDoc
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const EMPTY_DOC = doc([{ type: 'paragraph' }])

const section = (label: string, body: ProseMirrorDoc = doc([para('A wine bar in Tiong Bahru.')])) =>
  ({ label, body }) as const

describe('sectionBodyToLine', () => {
  it('flattens a single paragraph', () => {
    expect(sectionBodyToLine(doc([para('A wine bar in Tiong Bahru.')]))).toBe(
      'A wine bar in Tiong Bahru.',
    )
  })

  // The point of the collapse: `proseMirrorDocToPlainText` joins blocks with a
  // blank line, which a `<p>` renders as one run with a stray gap in it.
  it('collapses a multi-block body onto one line', () => {
    expect(sectionBodyToLine(doc([para('A wine bar.'), para('Warm, never precious.')]))).toBe(
      'A wine bar. Warm, never precious.',
    )
  })

  it('collapses list items the same way', () => {
    const body = doc([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [para('Neighbourhood first.')] },
          { type: 'listItem', content: [para('Natural wine only.')] },
        ],
      },
    ])
    expect(sectionBodyToLine(body)).toBe('Neighbourhood first. Natural wine only.')
  })

  // `null`, not `''` — the callers branch on it, and an empty string would put
  // an empty `<p>` on screen instead of the affordance.
  it('returns null for an empty body', () => {
    expect(sectionBodyToLine(EMPTY_DOC)).toBeNull()
    expect(sectionBodyToLine(doc([]))).toBeNull()
  })

  it('returns null for a body holding only whitespace', () => {
    expect(sectionBodyToLine(doc([para('   ')]))).toBeNull()
  })

  // A generator's ceiling is not this function's business: a hand-typed TL;DR
  // is as long as its author wanted, and the surface clamps it in CSS where the
  // full text stays one scroll away.
  it('does not truncate a long TL;DR', () => {
    const long = 'x'.repeat(900)
    expect(sectionBodyToLine(doc([para(long)]))).toHaveLength(900)
  })
})

describe('brandTldrLine', () => {
  it('finds the TL;DR among other sections', () => {
    const sections = [section('Voice & tone'), section('TL;DR', doc([para('A wine bar.')]))]
    expect(brandTldrLine(sections)).toBe('A wine bar.')
  })

  // Same punctuation tolerance as every other TL;DR lookup, and for the same
  // reason: the semicolon is the part nobody types twice the same way.
  it('accepts however the label was punctuated', () => {
    for (const spelling of ['TLDR', 'tl;dr', 'TL-DR', ' tldr ']) {
      expect(brandTldrLine([section(spelling, doc([para('A wine bar.')]))])).toBe('A wine bar.')
    }
  })

  it('returns null when the brand has no TL;DR', () => {
    expect(brandTldrLine([section('Voice & tone')])).toBeNull()
    expect(brandTldrLine([])).toBeNull()
  })

  // The labelled-but-empty row is what a rail suggestion chip creates. Reading
  // its existence as a TL;DR would blank the header before anyone typed a word.
  it('returns null for a labelled TL;DR with an empty body', () => {
    expect(brandTldrLine([section('TL;DR', EMPTY_DOC)])).toBeNull()
  })
})

describe('brandDescriptionLine', () => {
  it('prefers the TL;DR over a typed description', () => {
    expect(brandDescriptionLine({ tldr: 'A wine bar.', description: 'Older copy.' })).toBe(
      'A wine bar.',
    )
  })

  // Casa Vostra's case, and the one that produced the change.
  it('falls back to the description when there is no TL;DR', () => {
    expect(brandDescriptionLine({ tldr: null, description: 'Older copy.' })).toBe('Older copy.')
  })

  it('returns null when neither exists', () => {
    expect(brandDescriptionLine({ tldr: null, description: null })).toBeNull()
    expect(brandDescriptionLine({})).toBeNull()
  })

  // A whitespace-only value is not a value. Without this a description of `' '`
  // would win over a real TL;DR, and a TL;DR of `' '` would beat a real
  // description — both of which put a blank line where the affordance belongs.
  it('treats a blank string as absent on either side', () => {
    expect(brandDescriptionLine({ tldr: '   ', description: 'Older copy.' })).toBe('Older copy.')
    expect(brandDescriptionLine({ tldr: null, description: '   ' })).toBeNull()
  })

  it('trims what it returns', () => {
    expect(brandDescriptionLine({ tldr: '  A wine bar.  ' })).toBe('A wine bar.')
  })
})

// The db package's brand-grid query narrows section rows in SQL against this
// key. It is asserted here rather than restated there.
describe('TLDR_SECTION_KEY', () => {
  it('is the normalised TL;DR label', () => {
    expect(TLDR_SECTION_KEY).toBe('tldr')
  })
})
