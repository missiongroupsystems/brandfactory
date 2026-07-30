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

/**
 * The hint under the row, and it used to be **directions rather than a hint.**
 *
 * *"The full report is a conversation in Brand context. Read it there…"* was an
 * accurate description of a three-step errand: leave the hub, land on the list of
 * every conversation the brand has, recognise which card was the research by the
 * date in its title, open it, scroll one 68,000-character bubble. The row now
 * opens the report where you are, so the sentence that told you where to go has
 * nothing left to say and the one thing worth teaching is what to do with it.
 */
export const RESEARCH_REPORT_ROW_HINT =
  'Opens here in full. Capture what matters into the guidelines as you read.'

/**
 * The same finished run, when the **conversation** is not there.
 *
 * 1.13.2 added this because `hasReportToRead` is `status === 'COMPLETED'` and
 * `landReportInThread` swallows its own failure, so a completed job could send
 * you to a Brand context that never received anything. Its answer was to drop
 * the affordance: no link, no button, just the words `Research finished`.
 *
 * **That answer was one layer too high, and this is the correction.** The report
 * is not in the thread — it is on the job row, and the thread was only ever a
 * copy of it. So a failed landing costs the *conversation*, never the report,
 * and hiding the report to report a missing conversation was the release telling
 * the user to spend $0.40 again for a document sitting in the database.
 *
 * The row keeps working. What changes is one sentence and what it recommends:
 * the anomaly is named, the report is offered anyway, and re-running is no
 * longer the advice. Both ways to get here still go unnamed individually — a
 * deleted thread and a landing that failed are indistinguishable from the
 * client, and guessing between them is the mistake `RESEARCH_REPORT_ROW_HINT`
 * already refuses to make about drafts.
 */
export const RESEARCH_REPORT_MISSING_HINT =
  'The conversation from this run is not in Brand context — it either failed to land or has been deleted. The report itself is still here.'

// ---------------------------------------------------------------------------
// The report dialog
// ---------------------------------------------------------------------------
//
// **The report used to be three navigations away from the surface that announced
// it**, and the first of them landed on a page that does not mention research.
// It opens here instead, and the way onward to the conversation is a footer
// action rather than the only route in.

export const RESEARCH_REPORT_DIALOG_TITLE = 'Research report'

/**
 * The dialog's one line of provenance: **which brand, when, how well sourced, and
 * what it cost.**
 *
 * Every part is omitted rather than defaulted when it is not known. `0 sources`
 * and `$0.00` are both statements this repo has no business making — the citation
 * count is the honest signal about a report the whole feature warns can be
 * confidently wrong (research decision 4), and the cost is a bill.
 *
 * **UTC, matching `researchThreadName` on the server**, and dated by `startedAt`
 * for the same reason: the conversation this report created is named for the day
 * the run was asked for, and a local-time render would put one run under two
 * dates for anyone west of Greenwich after 5pm.
 */
export function researchReportMeta(input: {
  brandName: string
  startedAt: string | null
  sourceCount: number
  costUsd: number | null
}): string {
  const parts = [input.brandName]

  if (input.startedAt) {
    const at = new Date(input.startedAt)
    if (!Number.isNaN(at.getTime())) {
      parts.push(
        new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(at),
      )
    }
  }

  if (input.sourceCount > 0) {
    parts.push(`${input.sourceCount} ${input.sourceCount === 1 ? 'source' : 'sources'}`)
  }

  // Two decimals on a number recorded to six. The row keeps the precision that
  // makes the ledger add up; a human reading one run wants the price.
  if (input.costUsd !== null) parts.push(`$${input.costUsd.toFixed(2)}`)

  return parts.join(' · ')
}

/**
 * The way through to the thread, which is where the report becomes *usable*: the
 * interviewer can already read it there (`routes/agent.ts` re-reads the
 * transcript every turn), so follow-up questions are answered against the
 * research, and 1.5.0's capture gesture works on the message.
 *
 * Named for the destination rather than the action — `View in brand context`
 * rather than `Open conversation` — because Brand context is a place the user
 * already knows from the rail's own heading and from `Talk it through`.
 */
export const RESEARCH_REPORT_VIEW_IN_CONTEXT = 'View in brand context'

/** Under the action, when the deep link is known. */
export const RESEARCH_REPORT_THREAD_HINT =
  'The report is also a conversation there — ask it follow-ups, or capture parts of it into the guidelines.'

/**
 * Under the action when `reportProjectId` is null, which is two histories a
 * client must not tell apart: the landing failed, or the run predates migration
 * 0007. The link degrades to the conversation list, which is a true statement
 * about where research threads live and not a claim that this run's is one of
 * them.
 */
export const RESEARCH_REPORT_THREAD_UNKNOWN_HINT =
  'This run has no conversation to open directly — Brand context lists whatever is there.'

export const RESEARCH_REPORT_LOADING = 'Loading the report…'

/**
 * The fetch failed, which is **not** the same statement as "there is nothing to
 * read". The report is on a row on a server; a failed request says something
 * about this browser's last few seconds and nothing about the artefact.
 */
export const RESEARCH_REPORT_LOAD_FAILED =
  'Could not load the report just now. It is stored with the run, so trying again shortly should work.'

/**
 * `COMPLETED` with a null report. No live path produces it — `finishResearchJob`
 * writes the status and the report in one statement — so this exists to say so
 * rather than to render an empty document as though that were the answer.
 */
export const RESEARCH_REPORT_EMPTY =
  'This run recorded no report. Nothing was lost that researching again would not rebuild.'
