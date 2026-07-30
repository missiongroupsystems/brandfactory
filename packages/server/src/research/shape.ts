import { shapeResearchIntoSections } from '@brandfactory/agent'
import type { LLMProvider } from '@brandfactory/adapter-llm'
import type { BrandId, ResearchDraft, ResearchSource } from '@brandfactory/shared'
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
}) => Promise<ResearchDraft[]>

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
    if (!brand) return []
    const settings = await resolveLLMSettings(brand.workspaceId, deps.env, deps.db)
    return shapeResearchIntoSections({
      brandName,
      report,
      citations,
      llmProvider: deps.llm,
      llmSettings: { providerId: settings.llmProviderId, modelId: settings.llmModel },
    })
  }
}
