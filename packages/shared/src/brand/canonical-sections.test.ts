import { describe, expect, it } from 'vitest'
import {
  brandOverviewSection,
  brandTldrSection,
  findSectionByLabel,
  normaliseSectionLabel,
  sameSectionLabel,
  suggestionForLabel,
} from './canonical-sections'
import {
  OVERVIEW_SECTION_LABEL,
  SUGGESTED_SECTIONS,
  TLDR_SECTION_LABEL,
  TLDR_TARGET_MAX_CHARS,
} from './suggested-categories'

describe('normaliseSectionLabel', () => {
  // The whole reason the function exists: `TL;DR` is the typography and `TLDR`
  // is what people type. One section either way.
  it('collapses case, punctuation and surrounding whitespace', () => {
    for (const spelling of ['TL;DR', 'TLDR', 'tl;dr', ' TL-DR ', 'tl dr', 'T.L.D.R.']) {
      expect(normaliseSectionLabel(spelling)).toBe('tldr')
    }
  })

  it('does not merge labels that differ by a word', () => {
    expect(normaliseSectionLabel('Voice & tone')).not.toBe(normaliseSectionLabel('Voice and tone'))
    expect(normaliseSectionLabel('Overview')).not.toBe(normaliseSectionLabel('Brand overview'))
  })

  // Under an `a-z0-9` class every one of these normalised to the empty string,
  // so any two of them compared equal — a brand naming its sections in its own
  // language had unrelated rows treated as one section. The rule is that
  // punctuation is noise; a script is not.
  it('keeps letters that are not English ones', () => {
    for (const label of ['ブランドの声', 'Голос бренда', 'Φωνή', 'صوت العلامة', 'เสียงแบรนด์']) {
      expect(normaliseSectionLabel(label)).not.toBe('')
    }
    expect(sameSectionLabel('ブランドの声', 'Голос бренда')).toBe(false)
    expect(sameSectionLabel('Ästhetik', 'Asthetik')).toBe(false)
  })

  it('still strips punctuation and case inside a non-English label', () => {
    expect(sameSectionLabel('ブランドの声', ' ブランドの声。')).toBe(true)
    expect(sameSectionLabel('Голос бренда', 'ГОЛОС, БРЕНДА')).toBe(true)
  })
})

describe('sameSectionLabel', () => {
  it('is the comparison the rail and the editor both make', () => {
    expect(sameSectionLabel('voice & tone', 'Voice & tone')).toBe(true)
    expect(sameSectionLabel(' Overview', 'overview ')).toBe(true)
    expect(sameSectionLabel('Overview', 'Values & positioning')).toBe(false)
  })
})

describe('SUGGESTED_SECTIONS', () => {
  it('leads with the two summary sections, in that order', () => {
    expect(SUGGESTED_SECTIONS[0]?.label).toBe(TLDR_SECTION_LABEL)
    expect(SUGGESTED_SECTIONS[1]?.label).toBe(OVERVIEW_SECTION_LABEL)
  })

  it('marks exactly the two summaries as synthesis and the rest as aspects', () => {
    const synthesis = SUGGESTED_SECTIONS.filter((s) => s.kind === 'synthesis').map((s) => s.label)
    expect(synthesis).toEqual([TLDR_SECTION_LABEL, OVERVIEW_SECTION_LABEL])
    expect(SUGGESTED_SECTIONS.filter((s) => s.kind === 'aspect')).toHaveLength(
      SUGGESTED_SECTIONS.length - 2,
    )
  })

  // TL;DR is the one section written to be injected rather than read, so it is
  // the one section with a ceiling of its own. Overview is the long version and
  // deliberately keeps the default.
  it('gives TL;DR its own length ceiling and nothing else one', () => {
    const capped = SUGGESTED_SECTIONS.filter((s) => s.targetMaxChars !== undefined)
    expect(capped.map((s) => s.label)).toEqual([TLDR_SECTION_LABEL])
    expect(capped[0]?.targetMaxChars).toBe(TLDR_TARGET_MAX_CHARS)
  })

  // Two suggestions that normalise alike would make one of them permanently
  // unreachable — the rail would count the other as covering it.
  it('has no two labels that normalise to the same key', () => {
    const keys = SUGGESTED_SECTIONS.map((s) => normaliseSectionLabel(s.label))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('suggestionForLabel', () => {
  it('resolves a suggestion however its punctuation was typed', () => {
    expect(suggestionForLabel('TLDR')?.label).toBe(TLDR_SECTION_LABEL)
    expect(suggestionForLabel('tl;dr')?.kind).toBe('synthesis')
    expect(suggestionForLabel('  overview ')?.label).toBe(OVERVIEW_SECTION_LABEL)
    expect(suggestionForLabel('voice & tone')?.kind).toBe('aspect')
  })

  it('returns nothing for a label of the user’s own invention', () => {
    expect(suggestionForLabel('Franchise fee schedule')).toBeUndefined()
    expect(suggestionForLabel('')).toBeUndefined()
  })
})

describe('findSectionByLabel and the two named lookups', () => {
  const sections = [
    { label: 'Voice & tone' },
    { label: 'TLDR' },
    { label: 'Overview' },
    { label: 'TL;DR' },
  ]

  it('finds a section under any spelling of its label', () => {
    expect(findSectionByLabel(sections, 'voice & tone')?.label).toBe('Voice & tone')
    expect(brandOverviewSection(sections)?.label).toBe('Overview')
  })

  // Nothing stops a brand having two rows with the same label, and the callers
  // want *the* TL;DR. Sections arrive in priority order, so first is the one
  // nearest the top of the user's own ordering.
  it('returns the first match when a brand has written two', () => {
    expect(brandTldrSection(sections)?.label).toBe('TLDR')
  })

  it('is undefined on a brand that has written neither', () => {
    expect(brandTldrSection([{ label: 'Values & positioning' }])).toBeUndefined()
    expect(brandOverviewSection([])).toBeUndefined()
  })
})
