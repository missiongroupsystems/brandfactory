import { shapeResearchIntoSections, type ShapeResearchResult } from '@brandfactory/agent'
import type { LLMProvider } from '@brandfactory/adapter-llm'
import type { BrandId, ResearchSource } from '@brandfactory/shared'
import type { Db } from '../db'
import type { Env } from '../env'
import { resolveLLMSettings } from '../settings'

/**
 * Report → drafts, as the lifecycle sees it.
 *
 * The service takes this as a **function**, not as an LLM provider, for the same
 * reason the ticker takes the whole service: it is the seam that lets the
 * lifecycle be tested without a model, and it is where "which model" is
 * answered — per workspace, at the moment the drafts are shaped, rather than
 * baked into the job at submission.
 */
export type ShapeResearchFn = (input: {
  brandId: BrandId
  brandName: string
  report: string
  citations: ResearchSource[]
}) => Promise<ShapeResearchResult>

/**
 * How long the writing model gets before the shaping pass is abandoned.
 *
 * Generous, because the input is genuinely large — 3A's real report was 67,780
 * characters, roughly 17k tokens in, and a compression pass over that is tens of
 * seconds of honest work. The ceiling is not about impatience; it is that
 * `generateObject` inherits no timeout of its own and this call is awaited
 * inside the ticker's sweep, whose `running` flag is released in a `finally`. An
 * unbounded call that never settles takes the whole reconciler with it for the
 * life of the process.
 *
 * Abandoning it costs a shaping pass, never the run: the report is on the row
 * before this is reached and `reconcileResearchJob` already completes the job
 * with zero drafts when shaping throws.
 */
export const SHAPE_TIMEOUT_MS = 3 * 60 * 1000

export interface ResearchShaperDeps {
  db: Pick<Db, 'getBrandById' | 'getWorkspaceSettings'>
  llm: LLMProvider
  env: Env
}

/**
 * **On the workspace's own configured model** (decision 5), resolved through the
 * same `resolveLLMSettings` the agent endpoint uses — so a workspace that has
 * chosen a model gets its drafts written by that model, and one that has not
 * falls back to the env default.
 *
 * Resolved *here*, at shaping time, rather than recorded on the job at
 * submission: the two stages are minutes apart, and the model that should write
 * is the one configured when the writing happens.
 */
export function createResearchShaper(deps: ResearchShaperDeps): ShapeResearchFn {
  return async ({ brandId, brandName, report, citations }) => {
    const brand = await deps.db.getBrandById(brandId)
    // **Thrown, not returned as an empty list.** A job being reconciled whose
    // brand has vanished is a genuine anomaly — `brand_research_jobs.brand_id`
    // cascades, so the row would be gone too — and returning `[]` made it the
    // fifth silent way to finish a paid run with no drafts. Throwing routes it
    // into `reconcileNow`'s existing catch, which logs `research shaping
    // failed` with the job id, and costs the run nothing it was not already
    // going to lose.
    if (!brand) throw new Error(`brand ${brandId} not found while shaping research drafts`)
    const settings = await resolveLLMSettings(brand.workspaceId, deps.env, deps.db)
    return shapeResearchIntoSections({
      brandName,
      report,
      citations,
      llmProvider: deps.llm,
      llmSettings: { providerId: settings.llmProviderId, modelId: settings.llmModel },
      // `ShapeResearchInput` has accepted a signal since 3D and nothing ever
      // passed one. See `SHAPE_TIMEOUT_MS`.
      signal: AbortSignal.timeout(SHAPE_TIMEOUT_MS),
    })
  }
}
