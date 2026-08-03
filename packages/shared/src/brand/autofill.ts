import { z } from 'zod'
import { ResearchDraftSchema } from '../research/job'

// ---------------------------------------------------------------------------
// Guideline section auto-fill — the wire between the sparkle and the draft
// ---------------------------------------------------------------------------
//
// `POST /brands/:id/guidelines/autofill` takes a label and returns a draft (or
// an honest reason there is none). The server never writes the section
// (decision 3): the draft lands in the row's editor un-saved, and the user's
// ordinary Save is the commit — through the same `PATCH …/guidelines` every
// other landing path funnels through.

/**
 * The request body. One field, because everything else the fill needs — the
 * brand's name, its website, its existing labels, whether a report exists — is
 * on the server already, derived from the brand the URL names (the same "no
 * body to tamper with" posture as `POST /brands/:id/research`).
 *
 * **Deliberately no `min`/`max` on the label.** The service trims, rejects
 * blank as a `ValidationError`, and clamps to `GUIDELINE_LABEL_MAX_CHARS` —
 * clamped, never validated-and-rejected, per that constant's own rule.
 */
export const AutofillSectionInputSchema = z.object({
  label: z.string(),
})
export type AutofillSectionInput = z.infer<typeof AutofillSectionInputSchema>

/**
 * Where the text came from — decided per request, on the server (decision 4):
 * `report` is Path R (the stored deep-research report, re-read on the
 * workspace's own model), `search` is Path S (a targeted vendor search, cents).
 * Latest-report-wins; the client never chooses.
 */
export const AutofillSourceSchema = z.enum(['report', 'search'])
export type AutofillSource = z.infer<typeof AutofillSourceSchema>

/**
 * Decision 7's honest outcomes, on the wire. `no-material` is a 200, not an
 * error — the report (or the search) genuinely has nothing solid for this
 * label, and the client owns the toast that says so. `invalid-shape` is Path
 * R's "the configured writing model did not answer in the schema" — a fact
 * about the deployment, not the brand, and still not worth a 5xx that would
 * read as the feature being broken.
 */
export const AutofillOutcomeSchema = z.enum(['ok', 'no-material', 'invalid-shape'])
export type AutofillOutcome = z.infer<typeof AutofillOutcomeSchema>

/**
 * The response. `draft` is present iff `outcome === 'ok'` — the exact
 * `ResearchDraft` shape 3D established, which is what lets the client land it
 * through the row's existing insert channel. Its `sources` are shown
 * transiently ("From N sources") and recorded on the server's event row; they
 * are never persisted on the section (Q3).
 */
export const AutofillSectionResultSchema = z.object({
  outcome: AutofillOutcomeSchema,
  source: AutofillSourceSchema,
  draft: ResearchDraftSchema.nullable(),
})
export type AutofillSectionResult = z.infer<typeof AutofillSectionResultSchema>
