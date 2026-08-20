import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOllama } from 'ollama-ai-provider'
import {
  type GroundedRequest,
  type GroundedResult,
  GroundedNotSupportedError,
  type LLMProvider,
  type LLMProviderConfig,
  type LLMProviderId,
  type LLMProviderSettings,
  ProviderNotConfiguredError,
} from './port'
import { createOpenRouterGrounded, type GroundedDeps } from './grounded'

// Per-provider AI-SDK factory. Resolved lazily on first call per providerId
// and cached so a long-lived server doesn't re-build provider clients on
// every getModel() call.
type ProviderFactory = (modelId: string) => LanguageModel

export interface LLMProviderDeps {
  // Test seams. Default impls call the real SDK provider modules.
  buildAnthropic?: (config: { apiKey: string }) => ProviderFactory
  buildOpenAI?: (config: { apiKey: string }) => ProviderFactory
  buildOpenRouter?: (config: { apiKey: string; baseURL?: string }) => ProviderFactory
  buildOllama?: (config: { baseURL?: string }) => ProviderFactory
  /** Test seam for `completeGrounded` — a `fetch` and a base URL. */
  grounded?: GroundedDeps
}

// Each AI-SDK provider returns a per-provider model type that is
// structurally compatible with AI-SDK core's `LanguageModel` but is not
// the same nominal type (per-provider types extend / specialize the
// core interface). The `as unknown as LanguageModel` cast here is the
// documented seam between per-provider shapes and the core surface —
// revisit if AI-SDK exposes a direct `asLanguageModel(...)` helper.
const defaultDeps: Required<LLMProviderDeps> = {
  buildAnthropic: ({ apiKey }) => {
    const provider = createAnthropic({ apiKey })
    return (modelId: string) => provider(modelId) as unknown as LanguageModel
  },
  buildOpenAI: ({ apiKey }) => {
    const provider = createOpenAI({ apiKey })
    return (modelId: string) => provider(modelId) as unknown as LanguageModel
  },
  buildOpenRouter: ({ apiKey, baseURL }) => {
    const provider = createOpenRouter({ apiKey, baseURL })
    return (modelId: string) => provider(modelId) as unknown as LanguageModel
  },
  buildOllama: ({ baseURL }) => {
    const provider = createOllama({ baseURL })
    return (modelId: string) => provider(modelId) as unknown as LanguageModel
  },
  // Empty rather than absent: `createOpenRouterGrounded` falls back to the
  // global `fetch` and the published base URL, so the default is "no seam".
  grounded: {},
}

export function createLLMProvider(
  config: LLMProviderConfig,
  deps: LLMProviderDeps = {},
): LLMProvider {
  const merged: Required<LLMProviderDeps> = { ...defaultDeps, ...deps }
  const cache = new Map<LLMProviderId, ProviderFactory>()

  function resolve(providerId: LLMProviderId): ProviderFactory {
    const cached = cache.get(providerId)
    if (cached) return cached
    let factory: ProviderFactory
    switch (providerId) {
      case 'anthropic':
        if (!config.anthropic) throw new ProviderNotConfiguredError('anthropic')
        factory = merged.buildAnthropic(config.anthropic)
        break
      case 'openai':
        if (!config.openai) throw new ProviderNotConfiguredError('openai')
        factory = merged.buildOpenAI(config.openai)
        break
      case 'openrouter':
        if (!config.openrouter) throw new ProviderNotConfiguredError('openrouter')
        factory = merged.buildOpenRouter(config.openrouter)
        break
      case 'ollama':
        // Ollama defaults to a local daemon if no baseURL is supplied.
        factory = merged.buildOllama(config.ollama ?? {})
        break
      default: {
        const _exhaustive: never = providerId
        throw new Error(`unknown LLM provider: ${String(_exhaustive)}`)
      }
    }
    cache.set(providerId, factory)
    return factory
  }

  // Built once, lazily, and only for openrouter. The other three providers have
  // no grounded endpoint behind this adapter, and saying so by name is better
  // than an absent method a caller could skip past — see `LLMProvider`.
  let grounded: ((req: GroundedRequest) => Promise<GroundedResult>) | undefined

  return {
    getModel(settings: LLMProviderSettings): LanguageModel {
      return resolve(settings.providerId)(settings.modelId)
    },

    completeGrounded(req: GroundedRequest): Promise<GroundedResult> {
      if (req.settings.providerId !== 'openrouter') {
        return Promise.reject(new GroundedNotSupportedError(req.settings.providerId))
      }
      if (!config.openrouter) {
        return Promise.reject(new ProviderNotConfiguredError('openrouter'))
      }
      grounded ??= createOpenRouterGrounded(config.openrouter, merged.grounded ?? {})
      return grounded(req)
    },
  }
}
