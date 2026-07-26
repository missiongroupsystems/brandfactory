import { describe, expect, it } from 'vitest'
import { Compass, FileText, MessageCircle, Palette, Users } from 'lucide-react'
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

  // The reason the fallback map exists: shorthand/custom labels must still get a
  // distinct glyph, or the collapsed icon-only rail is a row of identical files.
  it('resolves shorthand and custom labels by keyword', () => {
    expect(iconForSection('Voice')).toBe(MessageCircle)
    expect(iconForSection('Audience')).toBe(Users)
    expect(iconForSection('Values')).toBe(Compass)
    expect(iconForSection('Brand colours')).toBe(Palette)
  })

  it('falls back to FileText for a truly unknown label', () => {
    expect(iconForSection('Legal disclaimers')).toBe(FileText)
  })
})
