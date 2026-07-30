import { z } from 'zod'
import { ResearchJobIdSchema } from '../ids'
import { GUIDELINE_LABEL_MAX_CHARS } from '../brand/guideline-section'

// ---------------------------------------------------------------------------
// Brand research — the job as the client reads it
// ---------------------------------------------------------------------------
//
// Lifted from `packages/web/src/demo/researchTypes.ts`, which existed to be
// lifted: the 1.8.0 mockup typed its fixtures against a front-end-local mirror
// so the five rail states could be looked at before a table, a vendor or a
// route existed. Same move `asset/asset.ts` made in 2A, and the mirror is
// deleted in the same pass for the same reason — two declarations of one type
// is the second source of truth this plan keeps closing.
//
// **What is here is the *summary*, not the row.** 3C's `brand_research_jobs`
// has columns this does not (the provider, the model, the external id, the
// cost) and they stay server-side: a client that renders a footer row has no
// use for the vendor's job id, and shipping it would invite a client to poll
// the vendor directly.

/**
 * The job's states, as the locked document names them.
 *
 * **`IDLE` is deliberately not one of them.** It is the *absence* of a job —
 * `research: null`, which is what the query returns for a brand nobody has
 * researched — so a hub that has never run research renders exactly as it did
 * before the feature existed. A fifth enum member would make "never run" and
 * "run and reset" the same state, and they are not.
 *
 * `NO_FINDINGS` is terminal and is **ours, not the vendor's**: the provider
 * reports a completed run, and a completed run over a one-page holding site is
 * the ordinary way to reach it. It is a success that found nothing, which is
 * why it re-runs from the same row the entry point does.
 */
export const ResearchStatusSchema = z.enum([
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'NO_FINDINGS',
  'CANCELLED',
])
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>

/**
 * One citation, riding along on a draft (decision 9).
 *
 * The URL is `http`/`https` only, by the same rule and for the same reason as
 * `BrandWebsiteUrlSchema` and `AssetLinkUrlSchema`: it is rendered as a link,
 * it arrives from outside, and a bare `z.url()` accepts `javascript:` — 3A's
 * live report came back with 19 of these, so the volume is real and the
 * restriction belongs on the schema rather than at each render.
 */
export const ResearchSourceSchema = z.object({
  title: z.string().max(500),
  url: z.url({ protocol: /^https?$/ }).max(2048),
})
export type ResearchSource = z.infer<typeof ResearchSourceSchema>

/**
 * One shaped section — 3D's output, and the unit the review sheet offers.
 *
 * `html` and `text` are the same content twice, and that is not redundancy:
 * it is the `{ html, text }` pair `CapturePayload` already defines, which is
 * why the review sheet needs no `dangerouslySetInnerHTML`. The sheet shows the
 * text; the staging channel carries the HTML; only the editor's own schema ever
 * parses it. That seam is 1.5.0's and this reuses it rather than opening a
 * second one.
 */
export const ResearchDraftSchema = z.object({
  /**
   * Prefers a `SUGGESTED_SECTIONS` label. 3D is told to omit, never invent.
   *
   * Capped at `GUIDELINE_LABEL_MAX_CHARS`, **because a draft's only destination
   * is a guideline section** and this schema used to allow 80 characters more
   * than that destination accepts. See the constant for what that cost.
   */
  label: z.string().min(1).max(GUIDELINE_LABEL_MAX_CHARS),
  html: z.string(),
  text: z.string(),
  sources: z.array(ResearchSourceSchema),
})
export type ResearchDraft = z.infer<typeof ResearchDraftSchema>

/**
 * What the rail's footer row and the review sheet read.
 *
 * **Still no report here.** The report is tens of thousands of characters and
 * this shape is re-read every 5 seconds while a run is in flight, which is why
 * `ResearchReportSchema` below is a separate, once-per-open read rather than a
 * field added to this one.
 */
export const ResearchJobSummarySchema = z.object({
  id: ResearchJobIdSchema,
  status: ResearchStatusSchema,
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  /** Set on `FAILED` only. Shown as the row's reason, never as a stack trace. */
  error: z.string().nullable(),
  /** 3D's output. Empty on every state except `COMPLETED`. */
  drafts: z.array(ResearchDraftSchema),
  /** Distinct citations across the whole report — the toast's "from N sources". */
  sourceCount: z.number().int().nonnegative(),
})
export type ResearchJobSummary = z.infer<typeof ResearchJobSummarySchema>

/**
 * The expensive artefact itself — **read once, when somebody asks to read it.**
 *
 * `ResearchJobSummary` deliberately carries no report: 3A's live run came back
 * at 67,780 characters and the hub polls the summary every 5 seconds, so a
 * report on that wire is a novel per poll to render one footer row. This is the
 * other half of that decision rather than a reversal of it — one request, on
 * open, for a document that never changes again once the run is terminal.
 *
 * **`reportProjectId` is the thread 3F created, recorded.** It was not persisted
 * until now, which is why the rail's report row could only ever point at the
 * *list* of a brand's conversations and let the user work out which card was the
 * research. 1.13.2 named persisting it as the better answer and deferred it; the
 * modal is what made it worth taking, because a dialog that shows the report
 * needs somewhere honest to send you afterwards.
 *
 * `null` means one of two things and the client must not distinguish them: the
 * landing failed (`landReportInThread` swallows its own failure on purpose), or
 * the run predates the column. Both are handled the same way — offer the
 * conversation list, which is a true statement about where research threads live
 * and not a claim that a particular one exists.
 */
export const ResearchReportSchema = z.object({
  jobId: ResearchJobIdSchema,
  /** The brand name **as it was at submission** — see the job row's `input`. */
  brandName: z.string(),
  /**
   * Null on a completed run only if `finishResearchJob` recorded no report,
   * which no live path produces. Nullable because the column is, and a surface
   * that assumes otherwise crashes rather than explains.
   */
  report: z.string().nullable(),
  /** Every distinct citation the finder returned, for the report's own list. */
  sources: z.array(ResearchSourceSchema),
  /** What the vendor said this run cost. `null` is unknown, never zero. */
  costUsd: z.number().nullable(),
  /**
   * When the run **started**, not when it finished — and that is the same choice
   * `researchThreadName` makes, for the same reason. A run submitted at 23:58 and
   * reconciled at 00:04 is the research you asked for yesterday, and dating the
   * report one way while the conversation it created is named the other would
   * show one run under two dates.
   */
  startedAt: z.iso.datetime().nullable(),
  /** The brand-context thread 3F landed the report in, if it landed. */
  reportProjectId: z.string().nullable(),
})
export type ResearchReport = z.infer<typeof ResearchReportSchema>

// ---------------------------------------------------------------------------
// Accessors — the two questions every research surface asks
// ---------------------------------------------------------------------------
//
// Both take `null | undefined` on purpose. `null` is a brand nobody has
// researched; `undefined` is a query that has not answered yet. Neither is an
// error and neither may render a state — the same rule the palette follows.

/** Does this job have something waiting for a human? The rail's `ready` state. */
export function hasDraftsReady(job: ResearchJobSummary | null | undefined): boolean {
  return job?.status === 'COMPLETED' && job.drafts.length > 0
}

/**
 * Did this run produce a report a human can go and read?
 *
 * **The question the rail never asked, and the reason a finished run could look
 * like a run that never happened.** The footer had one success state — *N drafts
 * ready* — so a `COMPLETED` job with an empty `drafts` array fell through to the
 * bare `Research this brand` entry point, pixel-identical to a brand nobody has
 * ever researched. Two ordinary paths land there:
 *
 *   1. **Shaping produced nothing.** `reconcileResearchJob` completes the job
 *      with zero drafts when the writing model throws or times out — deliberate,
 *      because a paid report must not be discarded over a failed second stage.
 *      3G hit exactly this against a real 48,607-character report.
 *   2. **The drafts were already dealt with**, which is what empties `drafts`
 *      by design since 1.11.2.
 *
 * Both still have the report, and the report is the expensive artefact: it is on
 * the job row, written in the same `finishResearchJob` call that set this status.
 *
 * **That is what makes this a fact, and it is a narrower fact than it used to
 * be.** It was justified against 3F's thread — `COMPLETED` is the condition
 * `landReportInThread` runs under — and that function swallows its own failure,
 * so the claim was one silent error away from wrong (1.13.2 finding 2). The
 * report row now reads `ResearchReportSchema` off the row rather than sending the
 * user to look for a conversation, so the status and the readable artefact are
 * written together and the inference no longer crosses a fallible step.
 *
 * `NO_FINDINGS` is excluded and gets no thread — its "report" is the finder
 * saying the site gave it too little, which the rail already says in four words.
 */
export function hasReportToRead(job: ResearchJobSummary | null | undefined): boolean {
  return job?.status === 'COMPLETED'
}

/**
 * Is another run allowed?
 *
 * Every terminal state re-runs — including `NO_FINDINGS`, because a brand that
 * publishes a real site next month should not be locked out by the run that
 * happened while it was a holding page. Only an in-flight job says no, which is
 * also decision 12's one-active-job-per-brand rule expressed where the button
 * lives.
 */
export function canStartResearch(job: ResearchJobSummary | null | undefined): boolean {
  return job?.status !== 'IN_PROGRESS'
}

/**
 * What `GET /brands/:id/research` answers: **whether this deployment can
 * research at all**, and where the brand's latest run got to.
 *
 * One envelope rather than two calls, because the two facts are read together
 * and by the same component. `enabled` is deployment configuration
 * (`RESEARCH_PROVIDER`), not a per-brand or per-user permission — and it is what
 * the hub turns into the presence or absence of a callback, which is what makes
 * the rail's research row *not exist* on a deployment without a key rather than
 * exist and fail.
 *
 * `job: null` means nobody has researched this brand. It is the ordinary state
 * of almost every brand and it renders as silence, not as an empty state.
 */
export const BrandResearchStateSchema = z.object({
  enabled: z.boolean(),
  /**
   * `RESEARCH_JOB_MAX_MINUTES` — the age at which `abandonIfStale` closes a run
   * that the provider never finished.
   *
   * On the wire because the in-flight surface states it out loud. That ceiling
   * has existed since 1.11.2 and the UI has never mentioned it, so minute 4 and
   * minute 47 of a stuck run looked identical: same spinner, same sentence, no
   * indication that anything would ever end it. Deployment configuration, like
   * `enabled` beside it — not a per-brand fact — and read by the same component
   * in the same breath, which is why it rides the same envelope.
   *
   * **Optional, though the server always sends it.** The client also *writes*
   * this cache entry, from the `POST` response, which carries the job and
   * nothing about the deployment — and a run started from the create dialog has
   * no previous entry to inherit from. Absent therefore means *not yet known*,
   * which the in-flight row already renders as "claim no ceiling"; the 5-second
   * poll fills it in one tick later. The alternative is a default, and a
   * defaulted ceiling is a number the UI states with confidence and nobody
   * configured.
   */
  maxMinutes: z.number().int().positive().optional(),
  job: ResearchJobSummarySchema.nullable(),
})
export type BrandResearchState = z.infer<typeof BrandResearchStateSchema>

/**
 * Deployment-level research availability — no brand required.
 *
 * `GET /brands/:id/research` already returns `enabled`, but the create dialog
 * needs the answer **before a brand exists**. One boolean, same meaning as the
 * brand envelope's field: `RESEARCH_PROVIDER !== 'none'`.
 */
export const ResearchConfigSchema = z.object({
  enabled: z.boolean(),
})
export type ResearchConfig = z.infer<typeof ResearchConfigSchema>

// ---------------------------------------------------------------------------
// Honest cost / duration — the numbers the UI states *before* a paid run
// ---------------------------------------------------------------------------
//
// Measured, not guessed: 3A at $0.377 / 4.0 min, 3G at $0.4157 / 5.2 min, vendor
// ceiling 3–15 min. The create-dialog checkbox and the in-flight rail row both
// speak these; inventing a friendlier "$0.30" or "a few minutes" would be a
// different product from the one that bills ~$0.40.

/** Rough per-run cost shown before the user spends money. */
export const RESEARCH_COST_ESTIMATE = '≈$0.40'

/**
 * The promised window, as numbers.
 *
 * `RESEARCH_DURATION_RANGE` used to be the only form and it was a *sentence* —
 * fine while the sole consumer was copy beside a checkbox, useless the moment a
 * surface had to answer *"is this run late?"*. Parsing minutes back out of a
 * string with an en-dash in it is the kind of second source of truth this file
 * already refuses twice, so the numbers are primary and the sentence is derived.
 */
export const RESEARCH_DURATION_MIN_MINUTES = 3
export const RESEARCH_DURATION_MAX_MINUTES = 15

/** Wall-clock range the UI promises while a job is in flight. */
export const RESEARCH_DURATION_RANGE = `${RESEARCH_DURATION_MIN_MINUTES}–${RESEARCH_DURATION_MAX_MINUTES} minutes`
