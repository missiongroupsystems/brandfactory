import type { ProseMirrorDoc } from '../json'
import { sectionBodyToLine } from './description-line'

// ---------------------------------------------------------------------------
// How much of this brand is actually written down
// ---------------------------------------------------------------------------
//
// The question a surface asks before it spends a model call, and the one a
// modal has to answer after it covers the rail that was answering *which brand
// is this?*.
//
// **It must be computed, never decorative.** A `● Brand context loaded` dot
// that lights up because a brand row exists is worse than no dot at all: it
// would be lit on a brand with eight labelled sections and nothing written in
// any of them, which is precisely the state a user needs to be told about. The
// rail's suggestion chips create labelled rows with empty bodies on purpose, so
// *the row exists* and *the section says something* are two different facts and
// only the second one is worth reporting.
//
// The test for written is `sectionBodyToLine(body) !== null` — the exact test
// `brandTldrLine` already applies when it refuses to let an empty `TL;DR`
// replace a typed description. One rule for *does this section hold words*,
// used by both, so the header and the indicator cannot disagree about the same
// section.
//
// It lives in `shared` rather than in `web` because it is a rule about a wire
// shape, and because the planner's prompt wants the same number: a brief that
// says *2 of 8 sections written* on screen and hands the model a header built
// from a different count would be two answers to one question.

/** What `brandContextState` reports. `unwritten` is in the order given. */
export interface BrandContextState {
  /** Sections whose body holds words. */
  written: number
  /** Sections that exist at all — labelled rows, written or not. */
  total: number
  /** The labels of the rows that are labelled and empty. */
  unwritten: string[]
}

/**
 * How many of a brand's guideline sections actually say something.
 *
 * Structurally typed on `{ label, body }` rather than on
 * `BrandGuidelineSection`, the `brandTldrLine` precedent: every caller holds a
 * different superset of that pair — a full row, a draft on its way to one — and
 * the rule cares about neither.
 *
 * **A brand with no sections at all is `{ written: 0, total: 0 }`**, which a
 * surface must render as *no context yet* and never as *0 of 0 written*. The
 * distinction is not pedantry: `0 of 0` invites the reader to look for the rows
 * it is counting, and there are none to find.
 */
export function brandContextState<T extends { label: string; body: ProseMirrorDoc }>(
  sections: readonly T[],
): BrandContextState {
  const unwritten: string[] = []
  let written = 0
  for (const section of sections) {
    if (sectionBodyToLine(section.body) === null) unwritten.push(section.label)
    else written += 1
  }
  return { written, total: sections.length, unwritten }
}
