import { describe, expect, it } from 'vitest'
import {
  brandOverviewSection,
  brandTldrSection,
  findSectionByLabel,
  isSynthesisLabel,
  normaliseSectionLabel,
  sameSectionLabel,
  sectionKindForLabel,
  suggestedSectionIndex,
  suggestionForLabel,
} from './canonical-sections'
import {
  OVERVIEW_SECTION_LABEL,
  SUGGESTED_SECTIONS,
  TLDR_SECTION_LABEL,
  TLDR_TARGET_MAX_CHARS,
  VISUAL_GUIDELINES_SECTION_LABEL,
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

describe('sectionKindForLabel and isSynthesisLabel', () => {
  it('reads the kind off the taxonomy', () => {
    expect(sectionKindForLabel(TLDR_SECTION_LABEL)).toBe('synthesis')
    expect(sectionKindForLabel(OVERVIEW_SECTION_LABEL)).toBe('synthesis')
    expect(sectionKindForLabel(VISUAL_GUIDELINES_SECTION_LABEL)).toBe('aspect')
  })

  // The fallback `SuggestedSectionKind` documents: a label the taxonomy has
  // never proposed is one facet of the brand, which is how every label behaved
  // before `kind` existed. Never `undefined` — a surface branching on this must
  // not have a third case that drops a row off the screen.
  it('calls an unknown label an aspect', () => {
    expect(sectionKindForLabel('Franchise fee schedule')).toBe('aspect')
    expect(sectionKindForLabel('')).toBe('aspect')
  })

  // The placement question inherits the punctuation tolerance. A brand that
  // typed `TLDR` has a summary, and it has to be drawn where summaries are.
  it('recognises a summary under any spelling of its label', () => {
    expect(isSynthesisLabel('TLDR')).toBe(true)
    expect(isSynthesisLabel('tl;dr')).toBe(true)
    expect(isSynthesisLabel('  overview  ')).toBe(true)
  })

  // Tracks the constant rather than restating it — *which* entries are
  // synthesis is asserted above; this says the predicate agrees with them, so a
  // third summary section added later needs no edit here.
  it('agrees with the taxonomy on every entry', () => {
    for (const s of SUGGESTED_SECTIONS) {
      expect(isSynthesisLabel(s.label)).toBe(s.kind === 'synthesis')
    }
    expect(isSynthesisLabel('Voice & tone')).toBe(false)
    expect(isSynthesisLabel('Franchise fee schedule')).toBe(false)
  })
})

describe('suggestedSectionIndex', () => {
  // Derived from the constant rather than hard-coded, which is the point of the
  // function: 1.21.0's §5 hazard was a literal index that stayed valid-looking
  // after two entries were inserted above it.
  it('agrees with the taxonomy for every entry', () => {
    SUGGESTED_SECTIONS.forEach((s, i) => {
      expect(suggestedSectionIndex(s.label)).toBe(i)
    })
  })

  // The one ordering fact the rail's summary band depends on: the short version
  // precedes the long one, whichever a brand wrote first.
  it('puts TL;DR ahead of Overview', () => {
    expect(suggestedSectionIndex(TLDR_SECTION_LABEL)).toBeLessThan(
      suggestedSectionIndex(OVERVIEW_SECTION_LABEL),
    )
    expect(suggestedSectionIndex('TLDR')).toBe(suggestedSectionIndex(TLDR_SECTION_LABEL))
  })

  // Infinity rather than -1, so a custom label sorts *last* under a plain
  // numeric comparator instead of jumping to the front of the list.
  it('sorts a custom label last', () => {
    expect(suggestedSectionIndex('Franchise fee schedule')).toBe(Number.POSITIVE_INFINITY)
    const sorted = ['Photography', TLDR_SECTION_LABEL, 'Legal', OVERVIEW_SECTION_LABEL].sort(
      (a, b) => suggestedSectionIndex(a) - suggestedSectionIndex(b),
    )
    expect(sorted).toEqual([TLDR_SECTION_LABEL, OVERVIEW_SECTION_LABEL, 'Photography', 'Legal'])
  })
})
