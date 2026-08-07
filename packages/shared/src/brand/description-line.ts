import type { ProseMirrorDoc } from '../json'
import { proseMirrorDocToPlainText } from '../prose-mirror'
import { brandTldrSection, normaliseSectionLabel } from './canonical-sections'
import { TLDR_SECTION_LABEL } from './suggested-categories'

// ---------------------------------------------------------------------------
// The one line under a brand's name
// ---------------------------------------------------------------------------
//
// Two fields have always answered the same question. `brands.description` is a
// nullable column edited in the rename dialog; the `TL;DR` section is a
// guideline whose own description reads *"the whole brand in a few sentences —
// what it is, who it is for, how it sounds"*. `BrandIdentity`'s doc comment had
// already conceded the overlap in prose — *"the description is the brand's
// TL;DR"* — while the code kept them apart, so a brand with a written TL;DR
// still had a header asking it to *Add a description*.
//
// **The TL;DR wins.** It is the section the guidelines layer calls finalized
// output, it is the one a research run fills in on its own, and it is the one
// already destined to ride into every generation as standing context. A
// description typed before the TL;DR existed is the older, weaker copy of the
// same sentence, so it becomes the fallback rather than the winner.
//
// The cost of that order is real and worth stating: a brand holding both keeps
// a description nobody sees, and editing it in the rename dialog changes
// nothing on screen. That is the accepted trade — see the completion note. What
// is *not* traded away is the text itself: nothing here writes to either field,
// so clearing the TL;DR brings the description straight back.

/**
 * A section body reduced to a single line, or `null` when it holds no words.
 *
 * **Collapsed to one line, not truncated.** `proseMirrorDocToPlainText` joins
 * blocks with a blank line, which is right for a prompt and wrong for a `<p>`
 * under a heading: a two-paragraph TL;DR would render as one run with a stray
 * gap in it, because HTML folds the newlines but not the spacing around them.
 * Every whitespace run becomes a single space, so a bulleted TL;DR reads as a
 * sentence rather than as a collapsed list.
 *
 * Length is deliberately not touched here. `TLDR_TARGET_MAX_CHARS` binds what a
 * *generator* writes and not what a person types, so the ceiling belongs to the
 * surface that has to fit the text — where it is a CSS line clamp that the full
 * section is still one scroll away from — not to a shared function that would
 * hand every caller the same lossy string with no way back.
 */
export function sectionBodyToLine(body: ProseMirrorDoc): string | null {
  const line = proseMirrorDocToPlainText(body).replace(/\s+/g, ' ').trim()
  return line === '' ? null : line
}

/**
 * The brand's `TL;DR`, as one line, or `null` if it has none or wrote an empty
 * one.
 *
 * An empty body counts as no TL;DR, which is the whole reason this returns
 * `null` rather than `''`: a section row exists from the moment its label is
 * typed, and the rail's suggestion chips create labelled rows with empty bodies
 * on purpose. Treating the row's *existence* as the signal would blank the
 * header the instant someone clicked the `TL;DR` chip and before they wrote a
 * word — replacing a working description with nothing at all.
 */
export function brandTldrLine<T extends { label: string; body: ProseMirrorDoc }>(
  sections: readonly T[],
): string | null {
  const section = brandTldrSection(sections)
  return section ? sectionBodyToLine(section.body) : null
}

/**
 * The line a surface prints under the brand's name: the `TL;DR` when there is
 * one, the typed description otherwise, `null` when neither exists.
 *
 * **Takes two resolved strings rather than a brand**, because its two callers
 * hold different things. The hub has `BrandWithSections` and reaches the TL;DR
 * through `brandTldrLine`; the workspace grid has `BrandSummary`, which carries
 * a pre-flattened `tldr` resolved in SQL because shipping every section body of
 * every brand to draw a two-line card would be absurd. Passing the precedence
 * two strings is what lets those two paths meet at one rule instead of stating
 * it twice, once per shape.
 */
export function brandDescriptionLine(input: {
  tldr?: string | null
  description?: string | null
}): string | null {
  const tldr = input.tldr?.trim()
  if (tldr) return tldr
  const description = input.description?.trim()
  return description ? description : null
}

/**
 * `TL;DR` reduced to its comparison key — `'tldr'`.
 *
 * Exists for `packages/db`, whose brand-grid query has to narrow the section
 * rows *in SQL* and cannot call `normaliseSectionLabel` there. Exporting the
 * key means the query duplicates only the character-stripping rule and not the
 * label it is looking for, and the SQL is a prefilter in any case: the mapper
 * re-checks the row it gets back with `sameSectionLabel`, so the two can only
 * disagree by over-fetching one row, never by picking the wrong section.
 */
export const TLDR_SECTION_KEY = normaliseSectionLabel(TLDR_SECTION_LABEL)
