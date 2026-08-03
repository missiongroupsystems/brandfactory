import {
  BookOpen,
  Compass,
  FileText,
  MessageCircle,
  MessageSquareText,
  Palette,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { normaliseSectionLabel } from '@brandfactory/shared'

// Section label → icon. Keyed on the SUGGESTED_SECTIONS labels
// (packages/shared/src/brand/suggested-categories.ts) but tolerant of any
// custom label a user types.
//
// **Keyed on `normaliseSectionLabel`, not on the raw lowercase string**, which
// is what makes `TL;DR` addressable at all: its punctuation is the part nobody
// types the same way twice, and a rail row that loses its glyph because someone
// wrote `TLDR` is exactly the collapse-to-FileText this file exists to prevent.
// The keys below are written pre-normalised so the lookup is a plain map hit.
const SECTION_ICONS: Record<string, LucideIcon> = {
  // The pair reads as a pair on purpose: the lightning bolt is the brand in
  // three sentences, the open book is the long version of the same thing.
  tldr: Zap,
  overview: BookOpen,
  targetaudience: Users,
  voicetone: MessageCircle,
  valuespositioning: Compass,
  visualguidelines: Palette,
  messagingframeworks: MessageSquareText,
}

// Fallback keyword map: shorthand or custom labels ("Voice", "Audience",
// "Colours") still earn a distinct glyph instead of collapsing to FileText.
// This matters most in the context bar's collapsed icon-only rail, where a
// rail of identical file icons is unusable. Ordered most- to least-specific;
// first substring hit wins.
const KEYWORD_ICONS: ReadonlyArray<readonly [string, LucideIcon]> = [
  // Ahead of everything, because a `Summary` or `In a nutshell` row is the
  // TL;DR under another name, and it would otherwise be claimed by whichever
  // aspect keyword its wording happens to contain.
  ['tl;dr', Zap],
  ['tldr', Zap],
  ['nutshell', Zap],
  ['summary', Zap],
  ['overview', BookOpen],
  ['about', BookOpen],
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
  // **Below the visual keywords, not up with `about`.** It reads as an
  // Overview synonym in `Company background` and as a surface in
  // `Background colour` — and up top it claimed both. Here the compound cases
  // resolve on their visual word and the bare Overview sense still lands.
  // `Background imagery` has no visual keyword to catch it and stays a book;
  // that one is genuinely ambiguous and it is only a glyph.
  ['background', BookOpen],
  ['messag', MessageSquareText],
  ['tagline', MessageSquareText],
  ['copy', MessageSquareText],
  ['pitch', MessageSquareText],
]

export function iconForSection(label: string): LucideIcon {
  const exact = SECTION_ICONS[normaliseSectionLabel(label)]
  if (exact) return exact
  // The keyword pass stays on the plain lowercase string rather than the
  // normalised one. It is a substring search over words a person wrote, and
  // removing the spaces first makes every *word junction* a possible match:
  // `Custom Erasure` normalises to `customerasure`, which contains `customer`.
  // The cost is that punctuated shorthand has to be listed in both spellings —
  // hence `tl;dr` beside `tldr` below.
  const l = label.trim().toLowerCase()
  for (const [kw, icon] of KEYWORD_ICONS) {
    if (l.includes(kw)) return icon
  }
  return FileText
}
