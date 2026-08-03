import { markdownToDraftBody, stripCitationMarkers } from '@brandfactory/agent'
import {
  ResearchProviderError,
  SECTION_NO_MATERIAL_SENTINEL,
  type ResearchProvider,
} from '@brandfactory/adapter-research'
import {
  GUIDELINE_LABEL_MAX_CHARS,
  sameSectionLabel,
  suggestionForLabel,
  type AutofillSectionResult,
  type BrandId,
  type UserId,
  type WorkspaceId,
} from '@brandfactory/shared'
import type { Db } from '../db'
import type { Env } from '../env'
import { HttpError, ValidationError } from '../errors'
import type { Logger } from '../logger'
import { ResearchLimitError, ResearchNotEnabledError } from './service'
import type { ShapeSectionFn } from './shape'

// ---------------------------------------------------------------------------
// Guideline section auto-fill — one label in, one draft (or an honest no) out
// ---------------------------------------------------------------------------
//
// A service rather than handler logic for the same reason `startResearch` is:
// the guards are the feature, and they belong where every caller inherits
// them. The server never writes the section (decision 3) — the draft goes back
// to the client, whose Save is the commit through the one guidelines writer.

export type AutofillDbDeps = Pick<
  Db,
  | 'getLatestResearchJob'
  | 'listSectionsByBrand'
  | 'recordSectionAutofill'
  | 'countSectionAutofillsTodayForWorkspace'
>

export type AutofillEnv = Pick<
  Env,
  'RESEARCH_PROVIDER' | 'RESEARCH_SECTION_MODEL' | 'RESEARCH_SECTION_MAX_PER_DAY'
>

export interface AutofillSectionDeps {
  db: AutofillDbDeps
  research: ResearchProvider
  env: AutofillEnv
  /** Path R — the section shaper seam, same shape-as-function reason as `shape`. */
  shapeSection: ShapeSectionFn
  /** Request-scoped. The cause of an upstream failure goes here, never to the user. */
  logger?: Logger
}

/**
 * An upstream we called did not answer — **502, not the bare 500 this shipped
 * as.**
 *
 * The deep run never needed this: its vendor call happens in a ticker sweep and
 * its failures land on the job row, where the rail renders them. Auto-fill is
 * the first synchronous outbound call in this repo, so it is the first place a
 * vendor's bad afternoon reaches a person — and what they got was
 * *"Internal Server Error"*, which is honest about our side and useless about
 * theirs. Phase E recorded that for Path R's missing LLM key and called a typed
 * error the obvious follow-up; it was equally true of Path S's vendor 429s,
 * 5xx and 60-second timeouts.
 *
 * The message says which upstream and what to do. The **cause** is logged
 * rather than returned: `onError` only logs what it does not recognise, so
 * making this an `HttpError` would otherwise have traded a useless toast for a
 * silent server.
 */
export class AutofillUpstreamError extends HttpError {
  constructor(message: string) {
    super(502, 'AUTOFILL_UPSTREAM', message)
    this.name = 'AutofillUpstreamError'
  }
}

/**
 * Did the search come back with nothing to write? **Two shapes, one outcome.**
 *
 * An empty completion is the obvious one and the only one Phase C's tests
 * covered — and the Phase E live pass found that this vendor never produces
 * it. Asked for a section the brand has no material for, `sonar-pro` obeys the
 * honesty rule in *prose*: 600 characters explaining that it will not invent
 * franchise terms. That is the right judgement wearing the wrong shape, and
 * without this check it reached the user as a successful draft — the model's
 * apology pasted into a guideline row, attributed to the agent.
 *
 * So the prompt now demands `SECTION_NO_MATERIAL_SENTINEL` and this recognises
 * it. Matched on the **whole body**, uppercased and stripped of markdown
 * emphasis and trailing punctuation — the instruction says "and nothing else",
 * so anything longer is a section, not a refusal. Deliberately not a substring
 * search: a real `Values` section may legitimately discuss having "no material
 * waste", and a loose match would delete it.
 */
export function isNoMaterial(text: string): boolean {
  // **Both sides through the same normaliser**, which is not fussiness: the
  // sentinel contains an underscore and `_` is also markdown emphasis, so a
  // one-sided strip turns `NO_MATERIAL` into `NOMATERIAL` and compares it to an
  // untouched constant. That mismatch is exactly what this helper's first
  // version shipped, and what its tests caught.
  const bare = normaliseForSentinel(text)
  return bare === '' || bare === normaliseForSentinel(SECTION_NO_MATERIAL_SENTINEL)
}

function normaliseForSentinel(value: string): string {
  return value
    .trim()
    .replace(/[*_`#]/g, '')
    .replace(/[.!\s]+$/, '')
    .toUpperCase()
}

export interface AutofillSectionInput {
  brandId: BrandId
  workspaceId: WorkspaceId
  brandName: string
  websiteUrl: string | null
  label: string
  userId: UserId | null
}

/**
 * Write the ledger row — **and never lose a draft over it.**
 *
 * The record happens after the work, which means a failing insert would 500 a
 * request whose expensive half already succeeded: on Path S the vendor has been
 * billed and the text is sitting in memory, one `throw` away from being thrown
 * out. The ledger exists to account for that spend and to feed the per-day cap;
 * neither is worth more than the thing spent on.
 *
 * So a failed write is logged loudly and the draft is returned. The cost is a
 * cap that under-counts by exactly the rows that failed to land — which is the
 * safe direction to be wrong in only because the alternative is the user paying
 * for a section twice.
 */
async function record(
  deps: Pick<AutofillSectionDeps, 'db' | 'logger'>,
  input: Parameters<AutofillDbDeps['recordSectionAutofill']>[0],
): Promise<void> {
  try {
    await deps.db.recordSectionAutofill(input)
  } catch (cause) {
    deps.logger?.error('section autofill: the ledger write failed — the draft was still returned', {
      brandId: input.brandId,
      label: input.label,
      source: input.source,
      costUsd: input.costUsd,
      err: cause instanceof Error ? cause.message : String(cause),
    })
  }
}

/**
 * Fill one guideline section, choosing the source at request time (decision
 * 4, latest-report-wins): a `COMPLETED` run with a report ⇒ **Path R**, the
 * stored report re-read on the workspace's own model — the user's own LLM
 * tokens, so it works even when `RESEARCH_PROVIDER=none`. Otherwise **Path S**,
 * a targeted vendor search, behind the 3C guard order with every guard above
 * the money line.
 *
 * **No in-flight unique index and no double-click arbiter here**, unlike the
 * deep run: a double-send costs cents, not $0.40 and 15 minutes. The client
 * disables the button while pending; the per-day cap is the backstop. A
 * decision, not an oversight (the plan writes it down; so does this).
 */
export async function autofillSection(
  deps: AutofillSectionDeps,
  input: AutofillSectionInput,
): Promise<AutofillSectionResult> {
  // Trimmed and clamped, never validated-and-rejected — the
  // `GUIDELINE_LABEL_MAX_CHARS` rule. Blank is the one refusal: there is no
  // section to fill.
  const label = input.label.trim().slice(0, GUIDELINE_LABEL_MAX_CHARS)
  if (!label) {
    throw new ValidationError('The section needs a label before it can be auto-filled.')
  }

  // What the label *is*, when it is one of ours — resolved here because both
  // prompt builders render each line iff supplied, and the caller owns the
  // match (the Phase A/B contract). Three facts now travel where one did:
  // `description` as before, plus the `kind` that decides whether the
  // neighbours are a fence or a foundation, and the section's own length
  // ceiling. A custom label resolves to nothing and gets every default.
  //
  // **Matched through `suggestionForLabel`, not `toLowerCase()`.** The row a
  // user types `TLDR` into is the `TL;DR` row in every sense that matters here,
  // and under the old comparison it would have been fed the generic prompt —
  // no description, aspect rules, 1200 characters — which is precisely the
  // combination that produces a bad TL;DR.
  const suggestion = suggestionForLabel(label)
  const description = suggestion?.description
  const kind = suggestion?.kind
  const maxChars = suggestion?.targetMaxChars

  // So the text does not restate a neighbouring section. The clicked row is
  // usually unsaved and absent; if it was saved empty first, it is excluded —
  // a section must not be told its own label is already covered.
  const sections = await deps.db.listSectionsByBrand(input.brandId)
  const existingLabels = sections.map((s) => s.label).filter((l) => !sameSectionLabel(l, label))

  // Path selection, on the server, at request time. `NO_FINDINGS` falls
  // through to Path S: its "report" is the finder saying the site gave it too
  // little, and re-reading that would manufacture `no-material` out of a
  // search that might succeed today.
  const latest = await deps.db.getLatestResearchJob(input.brandId)
  if (latest?.status === 'COMPLETED' && latest.report) {
    let shaped
    try {
      shaped = await deps.shapeSection({
        brandId: input.brandId,
        brandName: input.brandName,
        label,
        ...(description !== undefined ? { description } : {}),
        existingLabels,
        ...(kind !== undefined ? { kind } : {}),
        ...(maxChars !== undefined ? { maxChars } : {}),
        report: latest.report,
        citations: latest.citations,
      })
    } catch (cause) {
      deps.logger?.error('section autofill: writing model failed', {
        brandId: input.brandId,
        label,
        err: cause instanceof Error ? cause.message : String(cause),
      })
      throw new AutofillUpstreamError(
        "The workspace's writing model could not draft this section. Check the model settings and its API key, then try again.",
      )
    }

    // **The Phase E finding, applied to the path it was not found on.** That
    // pass caught `sonar-pro` answering an impossible section with 600
    // characters of honest apology, which — being non-empty — classified `ok`
    // and was one click from the brand's guidelines. Path R shipped guarded
    // only by `!text.trim()`, on the theory that a JSON schema gives the model
    // a compliant way to say nothing (an empty `markdown`) where a chat
    // completion has none. That is a real difference and it is not a guarantee:
    // a writing model that answers "The report does not cover Visual
    // guidelines." is in-schema, non-empty, and exactly the artefact the
    // sentinel exists to catch. One judgement, both paths — and it costs a
    // string compare on text already in hand.
    const refused =
      shaped.outcome === 'ok' && shaped.draft !== null && isNoMaterial(shaped.draft.text)
    if (refused) {
      deps.logger?.warn('section autofill: the writing model refused in prose, not in schema', {
        brandId: input.brandId,
        label,
        model: shaped.model,
      })
    }
    const outcome = refused ? 'no-material' : shaped.outcome
    const draft = outcome === 'ok' ? shaped.draft : null

    // Recorded only when a draft was produced: nothing landed on `no-material`
    // / `invalid-shape`, and no vendor money moved either way — there is
    // nothing for the ledger to remember. Cost is null because Path R spends
    // the user's own LLM tokens, which nothing here can price: unknown, never
    // zero.
    if (draft) {
      await record(deps, {
        brandId: input.brandId,
        label,
        source: 'report',
        model: shaped.model,
        costUsd: null,
        sources: draft.sources,
        createdBy: input.userId,
      })
    }
    return { outcome, source: 'report', draft }
  }

  // Path S — the 3C guard order, all above the money line.
  if (deps.env.RESEARCH_PROVIDER === 'none') throw new ResearchNotEnabledError()

  // The Casa Vostra rule, and it works harder here than on the deep run: a
  // bare-name search writes a confident, cited section about a same-named
  // other company, into a row with no 68k-char report for a human to notice
  // the wrong company in.
  if (!input.websiteUrl) {
    throw new ValidationError(
      'This brand has no website recorded. Add one before auto-filling — the search works from the site, not from the name.',
    )
  }

  const today = await deps.db.countSectionAutofillsTodayForWorkspace(input.workspaceId)
  if (today >= deps.env.RESEARCH_SECTION_MAX_PER_DAY) {
    throw new ResearchLimitError(
      `This workspace has used its ${deps.env.RESEARCH_SECTION_MAX_PER_DAY} section auto-fills for today.`,
    )
  }

  let result
  try {
    result = await deps.research.searchSection({
      brandName: input.brandName,
      websiteUrl: input.websiteUrl,
      label,
      ...(description !== undefined ? { description } : {}),
      existingLabels,
      ...(kind !== undefined ? { kind } : {}),
      ...(maxChars !== undefined ? { maxChars } : {}),
      model: deps.env.RESEARCH_SECTION_MODEL,
    })
  } catch (cause) {
    deps.logger?.error('section autofill: the search provider failed', {
      brandId: input.brandId,
      label,
      status: cause instanceof ResearchProviderError ? cause.status : null,
      err: cause instanceof Error ? cause.message : String(cause),
    })
    // Nothing was billed for a call that did not land, so nothing goes on the
    // ledger — the guards above are what protect the budget, and a failed
    // request is not spend.
    throw new AutofillUpstreamError(
      cause instanceof ResearchProviderError && cause.status === 429
        ? 'The research provider is rate-limiting us right now. Wait a minute and try again.'
        : 'The research provider could not be reached. Try again in a moment.',
    )
  }

  // The same post-processing Path R gets inside the shaper: markers out
  // (decision 10 — a TipTap row renders `[n]` as debris), then the two ways
  // the search can come back with nothing to write.
  const { html, text } = markdownToDraftBody(stripCitationMarkers(result.content))
  const draft = isNoMaterial(text) ? null : { label, html, text, sources: result.sources }

  // Recorded even when the search wrote nothing usable: the vendor billed the
  // work either way, and a cap that only counts successes lets a broken flow
  // spend all afternoon — the `countResearchJobsTodayForWorkspace` reasoning.
  await record(deps, {
    brandId: input.brandId,
    label,
    source: 'search',
    model: deps.env.RESEARCH_SECTION_MODEL,
    costUsd: result.usage.costUsd,
    sources: result.sources,
    createdBy: input.userId,
  })

  return draft
    ? { outcome: 'ok', source: 'search', draft }
    : { outcome: 'no-material', source: 'search', draft: null }
}
