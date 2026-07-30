import { describe, expect, it } from 'vitest'
import type { BrandGuidelineSection, ResearchDraft } from '@brandfactory/shared'
import { draftsToSections, draftsToStaged, sectionsUnchanged } from './researchDrafts'

function draft(over: Partial<ResearchDraft> = {}): ResearchDraft {
  return {
    label: 'Voice & tone',
    html: '<p>Warm, direct, <strong>never</strong> cute.</p>',
    text: 'Warm, direct, never cute.',
    sources: [],
    ...over,
  }
}

/** The first paragraph's text nodes, flattened — enough to see what survived. */
function firstParagraphText(body: unknown): string {
  const doc = body as { content?: { content?: { text?: string }[] }[] }
  return (doc.content?.[0]?.content ?? []).map((n) => n.text ?? '').join('')
}

describe('draftsToSections — E1’s payload', () => {
  it('parses each draft into a ProseMirror document', () => {
    const [section] = draftsToSections([draft()])

    expect(section?.body).toMatchObject({ type: 'doc' })
    expect(firstParagraphText(section?.body)).toBe('Warm, direct, never cute.')
  })

  // The point of parsing through `defaultExtensions` rather than storing HTML:
  // the marks the editor has survive, and anything else is dropped by the same
  // schema that would have dropped it on the way in through the review sheet.
  it('keeps the marks the editor has nodes for', () => {
    const [section] = draftsToSections([draft()])
    const marks = (
      (section?.body as { content?: { content?: { marks?: { type: string }[] }[] }[] }).content?.[0]
        ?.content ?? []
    ).flatMap((n) => n.marks ?? [])

    expect(marks.map((m) => m.type)).toContain('bold')
  })

  it('falls back to the plain-text half when a draft carries no html', () => {
    const [section] = draftsToSections([draft({ html: '', text: 'Neighbourhood regulars.' })])

    expect(firstParagraphText(section?.body)).toBe('Neighbourhood regulars.')
  })

  it('carries each label and orders the list as the model produced it', () => {
    const sections = draftsToSections([
      draft({ label: 'Voice & tone' }),
      draft({ label: 'Target audience' }),
      draft({ label: 'Positioning' }),
    ])

    expect(sections.map((s) => s.label)).toEqual(['Voice & tone', 'Target audience', 'Positioning'])
    expect(sections.map((s) => s.priority)).toEqual([1000, 2000, 3000])
  })

  // Stage 1B made this expressible; Stage 3E is what finally writes it.
  it('records the agent as the author', () => {
    expect(draftsToSections([draft(), draft()]).every((s) => s.createdBy === 'agent')).toBe(true)
  })

  it('returns nothing for no drafts', () => {
    expect(draftsToSections([])).toEqual([])
  })
})

describe('draftsToStaged — E2’s payload', () => {
  it('hands the editor both body halves, its label and its author', () => {
    const staged = draftsToStaged([draft({ label: 'Positioning' })])

    expect(staged).toEqual([
      {
        label: 'Positioning',
        payload: {
          html: '<p>Warm, direct, <strong>never</strong> cute.</p>',
          text: 'Warm, direct, never cute.',
        },
        createdBy: 'agent',
      },
    ])
  })

  // The asymmetry this closes: the same five drafts must not record a different
  // author depending on whether the brand they landed in happened to be empty.
  it('agrees with E1 about the author', () => {
    const drafts = [draft(), draft({ label: 'Target audience' })]

    expect(draftsToStaged(drafts).map((s) => s.createdBy)).toEqual(
      draftsToSections(drafts).map((s) => s.createdBy),
    )
  })
})

// ---------------------------------------------------------------------------
// sectionsUnchanged — the guard on Undo
// ---------------------------------------------------------------------------
//
// Undo is a full-list write of `[]`, which is correct while the only things in
// the list are the sections research just added and a total wipe one save later.

describe('sectionsUnchanged', () => {
  const section = (id: string, updatedAt = '2026-07-29T10:00:00.000Z') =>
    ({ id, updatedAt }) as BrandGuidelineSection

  it('is true for the list exactly as it was written', () => {
    const written = [section('a'), section('b')]

    expect(sectionsUnchanged([section('a'), section('b')], written)).toBe(true)
  })

  it('is false once a section has been added', () => {
    expect(sectionsUnchanged([section('a'), section('b')], [section('a')])).toBe(false)
  })

  it('is false once a section has been deleted', () => {
    expect(sectionsUnchanged([section('a')], [section('a'), section('b')])).toBe(false)
  })

  // The likeliest thing to happen in the seconds a toast is on screen, and the
  // one ids alone would miss.
  it('is false once a body has been edited', () => {
    expect(sectionsUnchanged([section('a', '2026-07-29T10:05:00.000Z')], [section('a')])).toBe(
      false,
    )
  })

  it('is false when the same sections come back reordered', () => {
    expect(sectionsUnchanged([section('b'), section('a')], [section('a'), section('b')])).toBe(
      false,
    )
  })
})
