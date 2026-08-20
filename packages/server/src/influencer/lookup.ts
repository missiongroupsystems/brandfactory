import { lookupCreator } from '@brandfactory/agent'
import type { LLMProvider } from '@brandfactory/adapter-llm'
import type { LookupInfluencerInput, LookupInfluencerResult } from '@brandfactory/shared'
import type { Env } from '../env'
import type { Logger } from '../logger'

// ---------------------------------------------------------------------------
// The lookup's seam — `IdeateThemesFn`'s shape, for two of its three reasons
// ---------------------------------------------------------------------------
//
// 1. A route test drives the whole handler chain — auth, access, validation,
//    response — with a fake function and no model at all.
// 2. The composition lives here rather than in the route, so the route stays the
//    four lines every other handler in this repo is.
//
// **The third reason does not apply, and that is the interesting part.**
// `createThemeIdeator` resolves the model *per workspace at call time*, because
// "the model that should write is the one configured when the writing happens".
// This one does not. See below.

/** The lookup, as the route sees it. */
export type LookupCreatorFn = (input: LookupInfluencerInput) => Promise<LookupInfluencerResult>

/**
 * How long a lookup gets before it is abandoned.
 *
 * **Measured rather than guessed**, which `IDEATE_THEMES_TIMEOUT_MS` explicitly
 * asks its successors to do. Phase E's 78 live calls put the winning
 * configuration at a 7.5s median and roughly 20s at the tail — one grounded
 * completion producing one small object, where pass 1 of the planner produces
 * eighteen. 60s is therefore generous by design rather than by default: it is
 * about three times the worst call observed, which leaves room for a slow search
 * without leaving somebody watching a spinner past the point it has become a
 * lie.
 */
export const LOOKUP_CREATOR_TIMEOUT_MS = 60_000

export interface CreatorLookupDeps {
  llm: LLMProvider
  env: Env
  log: Logger
}

/**
 * The real composition.
 *
 * **The model comes from `env`, never from the workspace's settings, and this is
 * a deliberate departure from every other model-backed path here.**
 * `resolveLLMSettings` lets a workspace override `llmModel`, and chat, guideline
 * shaping and the Post Planner all honour that — correctly, because for those
 * calls any competent model will do and the choice is the customer's.
 *
 * A lookup is not that. It requires a **search-grounded** model, which on
 * OpenRouter means the `:online` suffix, and a workspace that had set its model
 * to a perfectly good non-grounded id would silently lose the web plugin. The
 * failure would not look like a misconfiguration: the call would succeed, the
 * boundary rules would find no retrieval log behind any figure, and every lookup
 * would return `not-found` for creators that plainly exist.
 *
 * So `INFLUENCER_LOOKUP_MODEL` is the model and it is deployment-level. The
 * provider comes from `env` too, for the same reason — a workspace pointed at
 * anthropic has no grounded endpoint at all, and `completeGrounded` says so by
 * name rather than by returning nothing.
 *
 * **No db dependency falls out of that**, which is why this seam takes two things
 * where `IdeateDeps` takes three. There is no brand to load and no workspace row
 * to read; the route's `requireWorkspaceAccess` is the only thing that needed the
 * workspace, and it does that itself.
 */
export function createCreatorLookup(deps: CreatorLookupDeps): LookupCreatorFn {
  return async (input) => {
    // Captured through the engine's callback rather than returned in the
    // result: the result crosses the wire to a browser and a price does not
    // belong there. See `LookupCreatorInput.onUsage`.
    let costUsd: number | null = null
    const result = await lookupCreator({
      ...input,
      llmProvider: deps.llm,
      llmSettings: {
        providerId: deps.env.LLM_PROVIDER,
        modelId: deps.env.INFLUENCER_LOOKUP_MODEL,
      },
      signal: AbortSignal.timeout(LOOKUP_CREATOR_TIMEOUT_MS),
      onUsage: (usage) => {
        costUsd = usage.costUsd
      },
    })

    // **The one record this feature leaves behind.** Quick add writes no job
    // row — it is stateless by design — so without this line a deployment has
    // no way to answer what it spent on lookups or how many of them found
    // nobody. Both are the questions somebody asks first when the bill or the
    // hit rate looks wrong, and `retrieved: 0` is the signature of a model id
    // that lost its `:online` suffix. The handle is the public one that was
    // typed; nothing here is private to the workspace.
    deps.log.info('influencer lookup', {
      platform: input.platform,
      handle: input.handle,
      outcome: result.outcome,
      retrieved: result.sources.length,
      costUsd,
      model: deps.env.INFLUENCER_LOOKUP_MODEL,
    })

    return result
  }
}
