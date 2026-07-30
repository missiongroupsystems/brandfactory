import { z } from 'zod'
import { ResearchJobIdSchema } from '../ids'

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
  /** Prefers a `SUGGESTED_SECTIONS` label. 3D is told to omit, never invent. */
  label: z.string().min(1).max(200),
  html: z.string(),
  text: z.string(),
  sources: z.array(ResearchSourceSchema),
})
export type ResearchDraft = z.infer<typeof ResearchDraftSchema>

/** What the rail's footer row and the review sheet read. */
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
  job: ResearchJobSummarySchema.nullable(),
})
export type BrandResearchState = z.infer<typeof BrandResearchStateSchema>
