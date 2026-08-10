import { describe, expect, it } from 'vitest'
import type { ProseMirrorDoc } from '../json'
import {
  brandContentPillars,
  CONTENT_PILLAR_MAX_CHARS,
  contentPillarsDoc,
  MAX_CONTENT_PILLARS,
} from './content-pillars'
import { CONTENT_PILLARS_SECTION_LABEL } from './suggested-categories'

function section(label: string, body: ProseMirrorDoc) {
  return { label, body }
}

/** A plain paragraph per line — what someone typing into the editor produces. */
function paragraphs(...lines: string[]): ProseMirrorDoc {
  return {
    type: 'doc',
    content: lines.map((text) => ({
      type: 'paragraph',
      content: text === '' ? [] : [{ type: 'text', text }],
    })),
  }
}

describe('brandContentPillars', () => {
  it('reads one pillar per block of the named section', () => {
    const sections = [
      section('Voice & tone', paragraphs('Warm, plainspoken.')),
      section(CONTENT_PILLARS_SECTION_LABEL, paragraphs('Behind the pass', 'The room', 'Sourcing')),
    ]
    expect(brandContentPillars(sections)).toEqual(['Behind the pass', 'The room', 'Sourcing'])
  })

  it('finds the section through a punctuation-tolerant label', () => {
    const sections = [section('content-pillars', paragraphs('Sourcing'))]
    expect(brandContentPillars(sections)).toEqual(['Sourcing'])
  })

  it('is empty when the section is absent, and when it holds only whitespace', () => {
    expect(brandContentPillars([section('Voice & tone', paragraphs('Warm.'))])).toEqual([])
    expect(
      brandContentPillars([section(CONTENT_PILLARS_SECTION_LABEL, paragraphs('   ', ''))]),
    ).toEqual([])
  })

  it('strips a hand-typed list marker', () => {
    const body = paragraphs('- Behind the pass', '1. The room', '• Sourcing')
    expect(brandContentPillars([section(CONTENT_PILLARS_SECTION_LABEL, body)])).toEqual([
      'Behind the pass',
      'The room',
      'Sourcing',
    ])
  })

  it('collapses duplicates that differ only in case', () => {
    const body = paragraphs('Sourcing', 'sourcing', 'The room')
    expect(brandContentPillars([section(CONTENT_PILLARS_SECTION_LABEL, body)])).toEqual([
      'Sourcing',
      'The room',
    ])
  })

  it('clamps an over-long line rather than dropping it', () => {
    const prose = 'x'.repeat(CONTENT_PILLAR_MAX_CHARS + 40)
    const pillars = brandContentPillars([section(CONTENT_PILLARS_SECTION_LABEL, paragraphs(prose))])
    // Kept, because dropping it would have the run behave as if the brand wrote
    // nothing and then present the model's inventions beside a filled-in
    // section.
    expect(pillars).toHaveLength(1)
    expect(pillars[0]).toHaveLength(CONTENT_PILLAR_MAX_CHARS)
  })

  it('stops at the request schema’s ceiling', () => {
    const many = Array.from({ length: MAX_CONTENT_PILLARS + 5 }, (_, i) => `Pillar ${i}`)
    expect(
      brandContentPillars([section(CONTENT_PILLARS_SECTION_LABEL, paragraphs(...many))]),
    ).toHaveLength(MAX_CONTENT_PILLARS)
  })
})

describe('contentPillarsDoc', () => {
  it('round-trips through brandContentPillars', () => {
    const names = ['Behind the pass', 'The room', 'Sourcing', 'Occasions']
    const body = contentPillarsDoc(names)
    expect(brandContentPillars([section(CONTENT_PILLARS_SECTION_LABEL, body)])).toEqual(names)
  })

  it('writes a bullet list, not a run of paragraphs', () => {
    const doc = contentPillarsDoc(['Sourcing']) as {
      content: { type: string }[]
    }
    expect(doc.content[0]?.type).toBe('bulletList')
  })

  it('writes the editor’s empty document for an empty list', () => {
    expect(contentPillarsDoc([])).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(contentPillarsDoc(['  '])).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})
