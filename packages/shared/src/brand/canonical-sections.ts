import {
  OVERVIEW_SECTION_LABEL,
  SUGGESTED_SECTIONS,
  TLDR_SECTION_LABEL,
  type SuggestedSection,
} from './suggested-categories'

// ---------------------------------------------------------------------------
// Finding a named section in a brand whose labels are free text
// ---------------------------------------------------------------------------
//
// Guideline sections are **label-keyed by design** — the schema takes any
// string, the taxonomy is a suggestion, and a brand may have eight sections of
// its own invention (`suggested-categories.ts`, first paragraph). Nothing about
// that changes here. What changes is that two labels are now *addressed by
// name* rather than merely offered: `TL;DR` and `Overview` are the sections
// something other than a human goes looking for.
//
// `TL;DR` is the reason this file exists. Its stated purpose is to become
// standing context injected into every generation — so the lookup that finds it
// runs on every request that carries brand context, and it must not fail
// because someone typed `TLDR` in the label field. A resolver written once,
// here, is also the seam that keeps that future wiring from re-deciding what
// counts as a match in a fourth place.

/**
 * A label reduced to what it *means*, for comparison only.
 *
 * Lowercased with every non-alphanumeric character removed, which is what makes
 * `TL;DR`, `TLDR`, `tl;dr` and `TL-DR` one section. The semicolon is the
 * conventional typography and the thing nobody reliably types; the label the
 * user sees is untouched, and only the comparison is loosened.
 *
 * **Deliberately not clever.** It does not stem, alias or fuzzy-match:
 * `Voice and tone` still does not equal `Voice & tone`, exactly as it did not
 * before, because inventing that equivalence would silently merge two rows a
 * user meant to keep apart. The rule is *punctuation and case are noise; words
 * are not*.
 *
 * **`\p{L}\p{N}` and not `a-z0-9`, which is the whole rule and not a detail.**
 * An ASCII class does not keep *letters*, it keeps *English* — every character
 * of a label written in Japanese, Cyrillic, Greek, Arabic or Thai is stripped,
 * the label normalises to the empty string, and any two of them compare equal.
 * That inverts the rule above: for those scripts every word becomes noise, so a
 * brand naming its sections in its own language would have two unrelated rows
 * treated as one. The Unicode classes keep the answer identical for every ASCII
 * label (`TL;DR` → `tldr`, `Voice & tone` → `voicetone`) and correct for the
 * rest.
 */
export function normaliseSectionLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Do these two labels name the same section? See `normaliseSectionLabel`. */
export function sameSectionLabel(a: string, b: string): boolean {
  return normaliseSectionLabel(a) === normaliseSectionLabel(b)
}

/**
 * The `SUGGESTED_SECTIONS` entry a label names, if any.
 *
 * The one place that decides whether a typed label is a known section — which
 * is what carries its `description`, its `kind` and its `targetMaxChars` into
 * every generator. A custom label returns `undefined` and gets the defaults,
 * which is how it has always worked; the change is that the match is now
 * punctuation-tolerant, so a row labelled `TLDR` is fed the same prompt as one
 * labelled `TL;DR` instead of quietly being treated as a section nobody has
 * ever described.
 */
export function suggestionForLabel(label: string): SuggestedSection | undefined {
  const key = normaliseSectionLabel(label)
  return SUGGESTED_SECTIONS.find((s) => normaliseSectionLabel(s.label) === key)
}

/**
 * The first section carrying this label, or `undefined`.
 *
 * **First, not only**: nothing in the schema stops a brand having two rows
 * labelled `TL;DR`, and the readers of this function want *the* TL;DR rather
 * than a list. Section lists arrive in ascending `priority` (see
 * `listSectionsByBrand`), so "first" means the one nearest the top of the
 * user's own ordering — which is the one they would point at if asked.
 */
export function findSectionByLabel<T extends { label: string }>(
  sections: readonly T[],
  label: string,
): T | undefined {
  const key = normaliseSectionLabel(label)
  return sections.find((s) => normaliseSectionLabel(s.label) === key)
}

/**
 * The brand's `TL;DR` section, if it has written one.
 *
 * **The seam, and currently the only caller is a test.** This is deliberate:
 * the TL;DR already reaches the model today, as an ordinary `### TL;DR` in
 * `buildSystemPrompt`'s section block, because every section does. What it does
 * not yet have is the standing-context role it was added for — hoisted above
 * the guidelines, carried into surfaces that do not render the full section
 * list, and priced as a fixed per-request cost. That wiring is its own piece of
 * work; naming the lookup now is what stops it from arriving as a fourth
 * hand-rolled label comparison.
 */
export function brandTldrSection<T extends { label: string }>(
  sections: readonly T[],
): T | undefined {
  return findSectionByLabel(sections, TLDR_SECTION_LABEL)
}

/** The brand's `Overview` section, if it has written one. See `brandTldrSection`. */
export function brandOverviewSection<T extends { label: string }>(
  sections: readonly T[],
): T | undefined {
  return findSectionByLabel(sections, OVERVIEW_SECTION_LABEL)
}
