// ---------------------------------------------------------------------------
// A front-end-local mirror of the proposed research job summary
// ---------------------------------------------------------------------------
//
// The same job `src/demo/assetTypes.ts` does for `brand-assets.md`, done for
// `docs/plans/brand-research-onboarding.md` — which is **locked**, so this file
// renders its decisions and does not reopen them.
//
// Deleted alongside `assetTypes.ts` when `@brandfactory/shared` gains the real
// `research` types.

/**
 * The job's terminal and non-terminal states, as Phase C names them. `IDLE` is
 * **not** one of them — it is the absence of a job, and it is modelled here as
 * `research: null` rather than as a fifth status, because that is what the real
 * query returns for a brand nobody has researched.
 */
export type ResearchStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'NO_FINDINGS' | 'CANCELLED'

/** One citation, as it rides along on a draft (decision 9). */
export interface ResearchSource {
  title: string
  url: string
}

/**
 * One shaped section, Phase D's output. `label` prefers a `SUGGESTED_SECTIONS`
 * label; `html` is what a TipTap instance would parse — the mockup carries it
 * pre-rendered because Phase D's `generateObject` is not in this pass, and the
 * capture channel it feeds (`CapturePayload`) takes HTML anyway.
 */
export interface ResearchDraft {
  label: string
  html: string
  /**
   * The same content as plain text. Not redundant: this is the `{ html, text }`
   * pair `CapturePayload` already defines, and it is the reason the review sheet
   * needs no `dangerouslySetInnerHTML` — the sheet shows the text, the staging
   * channel carries the HTML, and only the editor's own schema ever parses it.
   */
  text: string
  sources: ResearchSource[]
}

/** What the rail's footer row and the review sheet read. */
export interface ResearchJobSummary {
  id: string
  status: ResearchStatus
  startedAt: string | null
  completedAt: string | null
  /** Set on `FAILED` only. Shown as the row's reason, never as a stack trace. */
  error: string | null
  /** Phase D output. Empty on every state except `COMPLETED`. */
  drafts: ResearchDraft[]
  /** Distinct citations across the whole report — the toast's "from N sources". */
  sourceCount: number
}

/** Does this job have something waiting for a human? The rail's `ready` state. */
export function hasDraftsReady(job: ResearchJobSummary | null | undefined): boolean {
  return job?.status === 'COMPLETED' && job.drafts.length > 0
}

/** Is another run allowed? Terminal states re-run; an in-flight job does not. */
export function canStartResearch(job: ResearchJobSummary | null | undefined): boolean {
  return job?.status !== 'IN_PROGRESS'
}
