import {
  Compass,
  FileText,
  MessageCircle,
  MessageSquareText,
  Palette,
  Users,
  type LucideIcon,
} from 'lucide-react'

// Section label → icon. Keyed on the SUGGESTED_SECTIONS labels
// (packages/shared/src/brand/suggested-categories.ts) but tolerant of any
// custom label a user types. Lookup is case-insensitive and trimmed so
// casing/whitespace drift still resolves.
const SECTION_ICONS: Record<string, LucideIcon> = {
  'target audience': Users,
  'voice & tone': MessageCircle,
  'values & positioning': Compass,
  'visual guidelines': Palette,
  'messaging frameworks': MessageSquareText,
}

// Fallback keyword map: shorthand or custom labels ("Voice", "Audience",
// "Colours") still earn a distinct glyph instead of collapsing to FileText.
// This matters most in the context bar's collapsed icon-only rail, where a
// rail of identical file icons is unusable. Ordered most- to least-specific;
// first substring hit wins.
const KEYWORD_ICONS: ReadonlyArray<readonly [string, LucideIcon]> = [
  ['voice', MessageCircle],
  ['tone', MessageCircle],
  ['audience', Users],
  ['persona', Users],
  ['customer', Users],
  ['value', Compass],
  ['position', Compass],
  ['mission', Compass],
  ['visual', Palette],
  ['color', Palette],
  ['colour', Palette],
  ['logo', Palette],
  ['type', Palette],
  ['messag', MessageSquareText],
  ['tagline', MessageSquareText],
  ['copy', MessageSquareText],
  ['pitch', MessageSquareText],
]

export function iconForSection(label: string): LucideIcon {
  const l = label.trim().toLowerCase()
  const exact = SECTION_ICONS[l]
  if (exact) return exact
  for (const [kw, icon] of KEYWORD_ICONS) {
    if (l.includes(kw)) return icon
  }
  return FileText
}
