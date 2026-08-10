import { ideatePostThemes, writePostCopy } from '@brandfactory/agent'
import type { LLMProvider } from '@brandfactory/adapter-llm'
import type {
  BrandId,
  BrandWithSections,
  IdeateCopyInput,
  IdeateCopyResult,
  IdeateThemesInput,
  IdeateThemesResult,
} from '@brandfactory/shared'
import type { Db } from '../db'
import type { Env } from '../env'
import { resolveLLMSettings } from '../settings'

// ---------------------------------------------------------------------------
// The planner's seam — `ShapeSectionFn`'s shape, for the same three reasons
// ---------------------------------------------------------------------------
//
// 1. A route test drives the whole handler chain — auth, access, validation,
//    response — with a fake function and no model at all.
// 2. *Which model* is answered per workspace **at call time**, not baked in at
//    boot. The model that should write is the one configured when the writing
//    happens.
// 3. The composition lives here rather than in the route, so the route stays
//    the four lines every other handler in this repo is.

/** Pass 1, as the route sees it. */
export type IdeateThemesFn = (
  input: IdeateThemesInput & { brandId: BrandId },
) => Promise<IdeateThemesResult>

/** Pass 2, same seam. */
export type IdeateCopyFn = (
  input: IdeateCopyInput & { brandId: BrandId },
) => Promise<IdeateCopyResult>

/**
 * How long pass 1 gets before it is abandoned.
 *
 * `SHAPE_SECTION_TIMEOUT_MS`' argument — past the ceiling the spinner has
 * become a lie and the honest move is the error toast — with more room, because
 * the output is different in kind: up to eighteen structured objects with seven
 * fields each, against one paragraph of prose. `generateObject` inherits no
 * timeout of its own.
 *
 * **This is a judgement, not a measurement.** Nothing in this repo has run a
 * `generateObject` call this large. Phase F is the first phase that will, and
 * it should adjust this with the reason recorded rather than leave the guess
 * standing because it was written down first.
 */
export const IDEATE_THEMES_TIMEOUT_MS = 90_000

/** Pass 2 writes prose from decisions already made, so it gets the usual 60. */
export const IDEATE_COPY_TIMEOUT_MS = 60_000

export interface IdeateDeps {
  db: Pick<Db, 'getBrandById' | 'listSectionsByBrand' | 'getWorkspaceSettings'>
  llm: LLMProvider
  env: Env
}

/**
 * The brand as the prompt needs it — the row plus its sections.
 *
 * **Thrown, not returned empty.** A request for a brand that does not exist has
 * already passed `requireBrandAccess`, which loads the same row; reaching here
 * with nothing means the brand was deleted between the two queries, and a run
 * that quietly planned for a brand with no name would be worse than a 500.
 */
async function loadBrand(deps: IdeateDeps, brandId: BrandId): Promise<BrandWithSections> {
  const [brand, sections] = await Promise.all([
    deps.db.getBrandById(brandId),
    deps.db.listSectionsByBrand(brandId),
  ])
  if (!brand) throw new Error(`brand ${brandId} not found while planning social posts`)
  return { ...brand, sections }
}

/** Pass 1's real composition — `createSectionShaper`'s shape verbatim. */
export function createThemeIdeator(deps: IdeateDeps): IdeateThemesFn {
  return async ({ brandId, ...input }) => {
    const brand = await loadBrand(deps, brandId)
    const settings = await resolveLLMSettings(brand.workspaceId, deps.env, deps.db)
    return ideatePostThemes({
      ...input,
      brand,
      llmProvider: deps.llm,
      llmSettings: { providerId: settings.llmProviderId, modelId: settings.llmModel },
      signal: AbortSignal.timeout(IDEATE_THEMES_TIMEOUT_MS),
    })
  }
}

/** Pass 2's. */
export function createCopyWriter(deps: IdeateDeps): IdeateCopyFn {
  return async ({ brandId, ...input }) => {
    const brand = await loadBrand(deps, brandId)
    const settings = await resolveLLMSettings(brand.workspaceId, deps.env, deps.db)
    return writePostCopy({
      ...input,
      brand,
      llmProvider: deps.llm,
      llmSettings: { providerId: settings.llmProviderId, modelId: settings.llmModel },
      signal: AbortSignal.timeout(IDEATE_COPY_TIMEOUT_MS),
    })
  }
}
