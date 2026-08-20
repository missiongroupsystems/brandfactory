import type { LanguageModel } from 'ai'
import type { LLMProviderId, ResearchSource } from '@brandfactory/shared'

// Re-export so existing `import { LLMProviderId } from '@brandfactory/adapter-llm'`
// call sites keep working. Source of truth lives in `@brandfactory/shared` so
// shared, adapter-llm, and the server's env loader can't drift.
export type { LLMProviderId }

export interface LLMProviderSettings {
  providerId: LLMProviderId
  modelId: string
}

/**
 * One search-grounded completion — the model reads the live web before it
 * answers, and reports what it read.
 *
 * **This exists because `getModel` cannot do it, which was measured rather than
 * assumed.** The influencer-lookup spike ran the same model and the same prompt
 * four ways; see
 * `docs/completions/influencer-quick-add-phase-e-the-lookup-spike.md`.
 *
 * | Shape | Searched? |
 * |---|---|
 * | `generateObject(getModel('…:online'))` | **no** — output identical to the non-search model |
 * | `generateObject` + the plugin passed through `providerOptions` | **no** |
 * | `generateText(getModel('…:online'))` | yes, but the answer arrives fenced |
 * | the provider's completion endpoint, called directly | yes, with citations |
 *
 * `generateObject` forces a tool call and the web plugin does not run beside
 * one. The failure is **silent**: the call succeeds, returns a well-formed
 * object, and quietly contains nothing. That is why this is a method on the port
 * rather than a helper a caller could write over `getModel` — the working
 * version needs the provider's own endpoint, and the vendor's name belongs in
 * this package.
 */
export interface GroundedRequest {
  settings: LLMProviderSettings
  /** The rules, the response shape, and everything true about this request. */
  system: string
  /**
   * The user turn, and **it is a search query rather than an instruction.**
   *
   * A grounding layer does not extract a query from this message; it *searches
   * this message*. The spike measured the difference at 1/10 against 6/10 on
   * the same rules — a user turn reading "Instagram profile @lennardy — follower
   * count, real name… Read https://… Return the JSON object described above"
   * retrieved a Bubble forum thread about the Instagram API and three pages like
   * it, because that is what the sentence is about.
   *
   * Keep this to the words somebody would type into a search box. Put the
   * instructions in `system`, where the search layer cannot see them.
   */
  query: string
  /**
   * JSON Schema for the provider's structured-output field.
   *
   * **Asked for, never relied upon.** The spike sent this with `strict: true`
   * and `additionalProperties: false`, and every capture came back with a value
   * outside the schema's own enum. What it reliably buys is a bare, unfenced
   * body; what it does not buy is a validated one. State the shape in `system`
   * too, and validate what comes back.
   */
  jsonSchema?: Record<string, unknown>
  maxTokens?: number
  signal?: AbortSignal
}

export interface GroundedResult {
  /** The raw assistant text. The caller parses and validates it. */
  text: string
  /**
   * **What the grounding layer actually fetched** — the retrieval log, not the
   * model's account of it.
   *
   * The distinction is the whole reason this field exists. One spike candidate
   * retrieved nothing across 26 calls and still returned confident sources,
   * including a fabricated analytics URL carrying a real-looking profile id for
   * a creator it had never looked up. A caller that checks a claim against the
   * model's own citation list is checking the model against itself.
   *
   * Empty where the provider searched nothing, and also where it will not say.
   * **Empty therefore means "no evidence", never "no search"** — a caller that
   * needs proof of grounding must treat the two the same way, because it cannot
   * tell them apart.
   */
  retrieved: ResearchSource[]
  /** Reported by the provider. `null` where it does not say — never assume zero. */
  costUsd: number | null
}

/**
 * The provider has no grounded-completion endpoint behind this adapter.
 *
 * Distinct from `ProviderNotConfiguredError`: the provider may be configured
 * perfectly and simply not offer this. A caller sees it as "this deployment
 * cannot look things up", which is a feature being absent rather than broken.
 */
export class GroundedNotSupportedError extends Error {
  constructor(providerId: LLMProviderId) {
    super(
      `LLM provider does not support grounded completion: ${providerId}. ` +
        'Set LLM_PROVIDER=openrouter, or leave the feature off.',
    )
    this.name = 'GroundedNotSupportedError'
  }
}

/** The provider or the vendor refused. Carries the HTTP status where there was one. */
export class GroundedRequestError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'GroundedRequestError'
    this.status = status
  }
}

export interface LLMProvider {
  getModel(settings: LLMProviderSettings): LanguageModel
  /**
   * One search-grounded completion. Throws `GroundedNotSupportedError` where the
   * provider has no such endpoint, which is every provider but openrouter today.
   *
   * **Required rather than optional on purpose.** An optional method would let a
   * fake omit it and a caller silently skip grounding; a required one makes
   * every implementation state what it does, and the refusal is a named error
   * rather than an `undefined`.
   */
  completeGrounded(req: GroundedRequest): Promise<GroundedResult>
}

export interface LLMProviderConfig {
  openrouter?: { apiKey: string; baseURL?: string }
  anthropic?: { apiKey: string }
  openai?: { apiKey: string }
  ollama?: { baseURL?: string }
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerId: LLMProviderId) {
    super(`LLM provider not configured: ${providerId}`)
    this.name = 'ProviderNotConfiguredError'
  }
}

export type { LanguageModel }
