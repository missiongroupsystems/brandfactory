import type { ProseMirrorDoc } from '../json'
import { proseMirrorDocToPlainText } from '../prose-mirror'
import { findSectionByLabel } from './canonical-sections'
import { CONTENT_PILLARS_SECTION_LABEL } from './suggested-categories'

// ---------------------------------------------------------------------------
// Content pillars — one guideline section, read as a list
// ---------------------------------------------------------------------------
//
// The planner asks the brand *what do you talk about, again and again* before it
// proposes anything. E1a answered the storage question with one entry in
// `SUGGESTED_SECTIONS`: pillars are a brand fact, so they live where every other
// brand fact lives, and they gain no table, no column and no taxonomy of their
// own.
//
// The price of that answer is this file. A guideline section is a rich-text
// document written by a person, and `IdeateThemesInput.pillars` is an array of
// short strings — so something has to turn one into the other, and it must be
// **one** something. Two readers of the same section would disagree the first
// time a brand wrote its pillars as a numbered list, and the disagreement would
// surface as the planner marking the brand's own pillars `proposed`.
//
// It lives beside `context-state.ts` for the reason that file states: a rule
// about a wire shape, wanted by a surface and by a prompt, belongs to neither of
// them.
//
// **One line, one pillar.** The document's own block structure is the list —
// bullets, numbered items and bare paragraphs all flatten to one block each
// through `proseMirrorDocToPlainText`. Nothing here splits on commas or full
// stops: a brand that writes its four pillars as one prose sentence gets one
// pillar, which the panel shows it verbatim, and the fix is to press Return
// three times rather than for this function to guess where a sentence was meant
// to be a row.

/**
 * How many pillars one brand may have — **the definition, not a restatement**.
 *
 * `IdeateThemesInputSchema` imports both of these rather than inlining `12` and
 * `80`, so the reader that clamps and the validator that rejects cannot
 * disagree. They live here because the bound is a fact about content pillars
 * rather than about one request that happens to carry them.
 */
export const MAX_CONTENT_PILLARS = 12

/** The longest one pillar's name may be. Imported by `PostIdeaSchema` too. */
export const CONTENT_PILLAR_MAX_CHARS = 80

/**
 * A leading list marker, as a person types one into a plain paragraph.
 *
 * A real bullet list carries no marker in its text — TipTap stores the shape,
 * not the glyph — so this only ever fires on someone who typed `- ` or `1. ` by
 * hand. Stripping it is what keeps `- Behind the pass` and `Behind the pass`
 * from reaching the model as two different pillars.
 */
const LIST_MARKER = /^\s*(?:[-*•‣–—]|\d+[.)])\s+/

/**
 * The brand's content pillars, in the order it wrote them.
 *
 * Empty when the section does not exist, holds no words, or holds only
 * whitespace — all three mean the same thing to the planner, which is *propose
 * some*. `IdeateThemesInput.pillars` being empty is exactly that request, and
 * `ideatePostThemes` is what turns it into the `proposed: true` marker.
 *
 * **Over-long entries are clamped, never dropped.** A paragraph of prose in this
 * section produces one ugly 80-character pillar, and a marketer looking at the
 * brief can see that and fix the section. Dropping it would instead have the run
 * silently behave as if the brand had written nothing — and then present the
 * model's own inventions beside a section the user had filled in, which is the
 * one outcome Q2 exists to prevent.
 *
 * Duplicates collapse case-insensitively: `Sourcing` and `sourcing` are one
 * pillar, and sending both would ask the model to group ideas under two headings
 * that read identically on the card.
 */
export function brandContentPillars<T extends { label: string; body: ProseMirrorDoc }>(
  sections: readonly T[],
): string[] {
  const section = findSectionByLabel(sections, CONTENT_PILLARS_SECTION_LABEL)
  if (!section) return []

  const seen = new Set<string>()
  const pillars: string[] = []
  for (const block of proseMirrorDocToPlainText(section.body).split('\n')) {
    const name = block.replace(LIST_MARKER, '').trim().slice(0, CONTENT_PILLAR_MAX_CHARS)
    if (name === '') continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    pillars.push(name)
    if (pillars.length >= MAX_CONTENT_PILLARS) break
  }
  return pillars
}

/**
 * The inverse: a list of pillar names as the section body that reads them back.
 *
 * A bullet list, because that is what a person writing four pillars into the
 * editor produces and what they will see when they open the section afterwards.
 * The names are written whole — `brandContentPillars` clamps on the way in, so
 * anything reaching here has already been through that bound.
 *
 * An empty list yields the editor's own empty document rather than an empty
 * `bulletList`, which TipTap would render as a stray bullet with nothing beside
 * it.
 */
export function contentPillarsDoc(names: readonly string[]): ProseMirrorDoc {
  const items = names.map((name) => name.trim()).filter((name) => name !== '')
  if (items.length === 0) return { type: 'doc', content: [{ type: 'paragraph' }] }
  return {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: items.map((name) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: name }] }],
        })),
      },
    ],
  }
}
