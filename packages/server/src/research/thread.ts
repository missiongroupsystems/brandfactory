import { BRAND_CONTEXT_TEMPLATE_ID } from '@brandfactory/agent'
import type { ResearchJob } from '@brandfactory/db'
import type { ProjectId } from '@brandfactory/shared'
import type { Db } from '../db'
import type { Logger } from '../logger'

// ---------------------------------------------------------------------------
// The report joins the conversation (Stage 3F)
// ---------------------------------------------------------------------------
//
// 3D turns the report into five short drafts and 3E lands those. **This is what
// happens to the other 66,000 characters.** A run that cost $0.377 produced one
// artefact of real substance, and until now the only thing that ever read it was
// the shaping prompt: the row kept it, the wire deliberately did not carry it
// (3C), and no surface showed it.
//
// It becomes the first `assistant` message of a **newly created** brand-context
// thread. Two consequences fall out of that choice rather than being built:
//
//   1. **Capture already works on it.** Whole message, excerpt, drag — the
//      1.5.0 gesture is a property of a message bubble, and nothing about it
//      asks how the message got there. The report is capturable into a
//      guideline section the moment it lands, and no code in this phase makes
//      that true.
//   2. **The interviewer can already read it.** `routes/agent.ts` re-reads
//      `listAgentMessages` on every turn, so the next thing you say in that
//      thread is answered against the research — for free, and only in the
//      thread where you asked for it.
//
// **A new thread, never an append.** That is rejected precedent, already
// written down in `brands.$brandId.context.tsx`: *"'resume the most recent' is
// wrong the first time you want a fresh line of thinking."* Appending a
// 67,780-character report to the conversation you happen to have open is a
// louder version of the same mistake.

export type ResearchThreadDbDeps = Pick<
  Db,
  'createProjectWithCanvas' | 'appendAgentMessage' | 'setResearchJobReportProject'
>

export interface ResearchThreadDeps {
  db: ResearchThreadDbDeps
  logger?: Logger
}

/**
 * `Brand research — Casa Vostra, 29 Jul 2026` (decision 11).
 *
 * The brand name comes off `job.input`, which recorded it **at submission** —
 * so a rename mid-run leaves the thread named for the company that was actually
 * researched, which is the same reason 3C put it on the row in the first place.
 *
 * Dated by when the run **started**, not when it finished: a run submitted at
 * 23:58 and reconciled at 00:04 is the research you asked for yesterday, and
 * that is how you will look for it. Formatted in UTC so the name a server
 * writes does not depend on where the server is.
 */
export function researchThreadName(brandName: string, startedAt: string | null): string {
  const at = startedAt ? new Date(startedAt) : new Date()
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(at)
  return `Brand research — ${brandName}, ${date}`
}

/**
 * Land a finished report as a thread. **Never throws.**
 *
 * The third refusal of the same shape as 3D's and 3C's — *do not throw away
 * something already paid for*. The report is on the row before this runs and
 * stays there if it fails; the drafts have already been shaped; the job is
 * already `COMPLETED`. A failed project insert must not turn any of that into a
 * failed run, so it is logged and swallowed, and the return value says what
 * happened for callers that care (the tests do; the service does not).
 */
export async function landReportInThread(
  deps: ResearchThreadDeps,
  job: ResearchJob,
): Promise<ProjectId | null> {
  if (!job.report) return null

  try {
    const { project } = await deps.db.createProjectWithCanvas({
      brandId: job.brandId,
      kind: 'standardized',
      // Imported from `@brandfactory/agent`, which the server already depends
      // on, rather than declared a third time here. That package's own comment
      // names the repo-wide `TEMPLATE_ID` map as a standing 1.4.0 follow-up and
      // says plainly that a `shared` home for the literal *is* that refactor —
      // so this phase reuses a copy instead of adding one.
      templateId: BRAND_CONTEXT_TEMPLATE_ID,
      name: researchThreadName(job.input.brandName, job.startedAt),
    })

    // No `userId`: the report is not something a person said, and the column is
    // nullable for exactly the assistant turns `routes/agent.ts` already writes
    // that way. It is also the whole report rather than a summary — the drafts
    // are the summary, and they went somewhere else.
    await deps.db.appendAgentMessage({
      projectId: project.id,
      role: 'assistant',
      content: job.report,
    })

    // **Migration 0007, and the return value stops going nowhere.** This id was
    // already computed here and handed back to a caller that ignored it, which is
    // why every surface downstream could only offer the *list* of a brand's
    // conversations and let the user match a date in a card title. Recorded last,
    // after the message: a job pointing at a thread with no report in it would be
    // a worse lie than a job pointing at nothing.
    //
    // Inside the same `try`, so a failure here is swallowed with the rest — the
    // thread exists and is reachable from Brand context either way, and the
    // report is on the job row regardless. Losing a link is not worth failing a
    // paid run over.
    await deps.db.setResearchJobReportProject(job.id, project.id)

    return project.id
  } catch (cause) {
    deps.logger?.error('research thread creation failed', {
      jobId: job.id,
      err: cause instanceof Error ? cause.message : String(cause),
    })
    return null
  }
}
