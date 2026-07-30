import { RESEARCH_COST_ESTIMATE, RESEARCH_DURATION_RANGE } from '@brandfactory/shared'

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
