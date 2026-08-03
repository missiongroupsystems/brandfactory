import { describe, expect, it } from 'vitest'
import {
  DRAFT_TARGET_MAX_CHARS,
  TLDR_TARGET_MAX_CHARS,
  VISUAL_GUIDELINES_SECTION_LABEL,
} from '@brandfactory/shared'
import {
  buildResearchPrompt,
  buildSectionSearchPrompt,
  SECTION_NO_MATERIAL_SENTINEL,
} from './prompt'

// ---------------------------------------------------------------------------
// The prompts, read as text
// ---------------------------------------------------------------------------
//
// `perplexity.test.ts` asserts that the *builders* are what reaches the wire;
// this asserts what the builders say. The lines pinned here are the ones a
// measurement or a live pass paid for — not the wording, but the rules the
// wording carries.

const SECTION_REQ = {
  brandName: 'Casa Vostra',
  websiteUrl: 'https://casavostra.example',
  label: 'Voice & tone',
  existingLabels: ['Target audience', 'Values & positioning'],
}

describe('buildResearchPrompt', () => {
  const prompt = buildResearchPrompt({
    brandName: 'Casa Vostra',
    websiteUrl: 'https://casavostra.example',
  })

  it('opens the report with the two summary headings', () => {
    expect(prompt).toContain('## TL;DR')
    expect(prompt).toContain('## Overview')
    expect(prompt.indexOf('## TL;DR')).toBeLessThan(prompt.indexOf('## Voice & tone'))
  })

  // The rule used to name its section by array position — `SUGGESTED_SECTIONS[3]`
  // — which two new entries at the head of that list would have re-pointed at
  // `Voice & tone` without failing anything.
  it('aims the no-hex rule at Visual guidelines by name', () => {
    expect(prompt).toContain(`Under "${VISUAL_GUIDELINES_SECTION_LABEL}"`)
    expect(prompt).toContain('not hex values')
  })

  it('says the summaries are written from everything below them', () => {
    expect(prompt).toContain('"TL;DR" and "Overview" come first but are written last')
  })

  // 3A's load-bearing lines, unchanged by any of the above.
  it('keeps the omit-rather-than-guess and stop-if-too-little rules', () => {
    expect(prompt).toMatch(/omit a heading entirely rather than guess/)
    expect(prompt).toMatch(/say so plainly and stop/)
  })
})

describe('buildSectionSearchPrompt', () => {
  it('names the brand, its site and the one section', () => {
    const prompt = buildSectionSearchPrompt(SECTION_REQ)
    expect(prompt).toContain('"Casa Vostra"')
    expect(prompt).toContain('https://casavostra.example')
    expect(prompt).toContain('"Voice & tone" section')
  })

  // Phase E's ship-blocker: without a sentinel the vendor answers an impossible
  // section with 600 characters of honest apology, which is non-empty content.
  it('demands the sentinel rather than a plain-language refusal', () => {
    expect(buildSectionSearchPrompt(SECTION_REQ)).toContain(
      `reply with exactly ${SECTION_NO_MATERIAL_SENTINEL} and nothing else`,
    )
  })

  it('tells an aspect not to restate its neighbours', () => {
    const prompt = buildSectionSearchPrompt({ ...SECTION_REQ, kind: 'aspect' })
    expect(prompt).toContain('Target audience, Values & positioning')
    expect(prompt).toContain('Do not restate what belongs there')
  })

  // The inversion. Told not to restate its neighbours, a summary of its
  // neighbours has been told not to exist — and the more a brand has written,
  // the more the prompt forbids.
  it('tells a synthesis section to draw on them instead', () => {
    const prompt = buildSectionSearchPrompt({
      ...SECTION_REQ,
      label: 'TL;DR',
      kind: 'synthesis',
    })
    expect(prompt).toContain('Target audience, Values & positioning')
    expect(prompt).toContain('summarises across all of them')
    expect(prompt).not.toContain('Do not restate what belongs there')
  })

  it('defaults to aspect when no kind is supplied', () => {
    expect(buildSectionSearchPrompt(SECTION_REQ)).toContain('Do not restate what belongs there')
  })

  it('states the section’s own ceiling when it has one, the default otherwise', () => {
    expect(buildSectionSearchPrompt(SECTION_REQ)).toContain(
      `at most ${DRAFT_TARGET_MAX_CHARS} characters`,
    )
    expect(buildSectionSearchPrompt({ ...SECTION_REQ, maxChars: TLDR_TARGET_MAX_CHARS })).toContain(
      `at most ${TLDR_TARGET_MAX_CHARS} characters`,
    )
  })

  it('omits the neighbours line entirely when there are none', () => {
    const prompt = buildSectionSearchPrompt({ ...SECTION_REQ, existingLabels: [] })
    expect(prompt).not.toContain('already have sections')
  })
})
