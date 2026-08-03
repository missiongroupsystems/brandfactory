import { describe, expect, it } from 'vitest'
import { BookOpen, Compass, FileText, MessageCircle, Palette, Users, Zap } from 'lucide-react'
import { iconForSection } from './guidelineIcons'

describe('iconForSection', () => {
  it('maps the exact suggested-section labels', () => {
    expect(iconForSection('Voice & tone')).toBe(MessageCircle)
    expect(iconForSection('Target audience')).toBe(Users)
    expect(iconForSection('Visual guidelines')).toBe(Palette)
  })

  it('is case- and whitespace-insensitive', () => {
    expect(iconForSection('  VOICE & TONE  ')).toBe(MessageCircle)
  })

  // The pair reads as a pair: the short version and the long version of the
  // same thing.
  it('gives the two summary sections their own glyphs', () => {
    expect(iconForSection('TL;DR')).toBe(Zap)
    expect(iconForSection('Overview')).toBe(BookOpen)
  })

  // The label whose punctuation nobody types the same way twice — and the
  // reason the exact map is keyed on the normalised form.
  it('resolves TL;DR however it was punctuated', () => {
    for (const spelling of ['TLDR', 'tl;dr', 'TL-DR', ' tldr ']) {
      expect(iconForSection(spelling)).toBe(Zap)
    }
  })

  // The reason the fallback map exists: shorthand/custom labels must still get a
  // distinct glyph, or the collapsed icon-only rail is a row of identical files.
  it('resolves shorthand and custom labels by keyword', () => {
    expect(iconForSection('Voice')).toBe(MessageCircle)
    expect(iconForSection('Audience')).toBe(Users)
    expect(iconForSection('Values')).toBe(Compass)
    expect(iconForSection('Brand colours')).toBe(Palette)
    expect(iconForSection('In a nutshell')).toBe(Zap)
    expect(iconForSection('Company background')).toBe(BookOpen)
  })

  // `background` reads two ways, so it sits below the visual keywords: a label
  // carrying one of those is about the surface, not about the company.
  it('lets a visual word win over “background”', () => {
    expect(iconForSection('Background colour')).toBe(Palette)
    expect(iconForSection('Visual background')).toBe(Palette)
    expect(iconForSection('Background')).toBe(BookOpen)
  })

  it('falls back to FileText for a truly unknown label', () => {
    expect(iconForSection('Legal disclaimers')).toBe(FileText)
  })
})
