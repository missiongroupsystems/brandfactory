import { createNoopResearchProvider } from './noop'
import { createPerplexityResearchProvider } from './perplexity'
import type { ResearchProvider } from './port'

/**
 * The shipped impls. Locked decision 15's rule, as the other four adapters
 * follow it: the enum lists **only what ships**, so widening it and widening
 * the switch below happen in the same commit and a misconfigured env fails at
 * boot rather than at first use.
 */
export const RESEARCH_PROVIDER_IDS = ['none', 'perplexity'] as const
export type ResearchProviderId = (typeof RESEARCH_PROVIDER_IDS)[number]

export interface ResearchProviderConfig {
  providerId: ResearchProviderId
  perplexity?: { apiKey: string; baseUrl?: string }
}

export function createResearchProvider(config: ResearchProviderConfig): ResearchProvider {
  switch (config.providerId) {
    case 'perplexity':
      if (!config.perplexity?.apiKey) {
        // Unreachable through `buildAdapters` — `EnvSchema`'s `superRefine`
        // requires the key when the provider is selected, the same way it does
        // for every LLM provider. Stated here so the type is not the only thing
        // holding it, and so a direct caller in a test cannot half-configure it.
        throw new Error("PERPLEXITY_API_KEY is required when RESEARCH_PROVIDER='perplexity'")
      }
      return createPerplexityResearchProvider(config.perplexity)
    case 'none':
      return createNoopResearchProvider()
  }
}
