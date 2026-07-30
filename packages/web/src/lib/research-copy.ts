import { RESEARCH_COST_ESTIMATE, RESEARCH_DURATION_RANGE } from '@brandfactory/shared'
import type { ResearchPace } from '@/lib/research-progress'

/**
 * UI copy for brand research — create dialog and in-flight rail row.
 *
 * Numbers live in `@brandfactory/shared` so a server error message and a
 * client label cannot drift. The sentences here are presentation only.
 */

/** Create-dialog checkbox label (decision 1). */
export const RESEARCH_OPT_IN_LABEL = 'Research this brand'

/** What the run does, how long, and what it costs — beside the checkbox. */
export function researchOptInHint(): string {
  return `reads the public web, ~${RESEARCH_DURATION_RANGE}, ${RESEARCH_COST_ESTIMATE}`
}

/** Why the checkbox is disabled when the website field is empty. */
export const RESEARCH_NEEDS_WEBSITE =
  'Needs a website. Runs in the background; the brand is created either way.'

/** In-flight: what to expect while the vendor has no partial payload. */
export function researchInFlightExpectation(): string {
  return `Usually ${RESEARCH_DURATION_RANGE}. Draft guideline sections and a full report land on this brand when ready.`
}

/**
 * The second line of the in-flight row, per pace.
 *
 * Three sentences for three genuinely different situations, where there used to
 * be one sentence for all of them. Each says the *next* true thing rather than
 * repeating the promise: inside the window, what is coming; past it, that we
 * know it is past it and are still watching; near the ceiling, that this ends
 * by itself and roughly when. None of them speculate about why.
 */
export function researchPaceLine(pace: ResearchPace, minutesToCeiling: number): string {
  if (pace === 'ceiling') {
    return `Still no answer from the provider. This run closes on its own in about ${minutesToCeiling} ${minutesToCeiling === 1 ? 'minute' : 'minutes'} so you can try again.`
  }
  if (pace === 'over') {
    return `Longer than the usual ${RESEARCH_DURATION_RANGE}. Still checking every few seconds — nothing is lost while it runs.`
  }
  return researchInFlightExpectation()
}

/**
 * The clock has stopped being trustworthy — say so rather than keep ticking.
 *
 * A ticking elapsed counter over a connection that is failing is a *worse* lie
 * than the frozen string it replaced: it looks like live confirmation that
 * something is happening. When the poll itself cannot get through, the run is
 * very likely still fine — it is a row on a server, not a browser tab — so this
 * reports the thing that is actually broken and does not claim the run died.
 */
export const RESEARCH_POLL_UNREACHABLE =
  'Cannot reach the server for an update. The run keeps going without this page; retrying.'

/**
 * A finished run whose drafts are gone — shaped none, or already taken.
 *
 * **The state that read as "nothing ever happened".** The rail's only success
 * row was `N drafts ready`, so a `COMPLETED` job with an empty `drafts` array
 * fell through to the bare entry point and a $0.40 run left no trace on the one
 * surface built to report it. The report is the substantial artefact either way,
 * and 3F has been landing it as a brand-context thread since it existed.
 *
 * The copy is deliberately silent on *why* `drafts` is empty. Shaping producing
 * nothing and drafts already accepted are indistinguishable on the wire, and
 * guessing wrong in either direction is worse than the one sentence that is true
 * in both.
 */
export const RESEARCH_REPORT_ROW_LABEL = 'Research finished — read the report'

export const RESEARCH_REPORT_ROW_HINT =
  'The full report is a conversation in Brand context. Read it there and capture what matters into the guidelines.'
