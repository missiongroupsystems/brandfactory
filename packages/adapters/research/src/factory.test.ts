import { describe, expect, it } from 'vitest'
import { createResearchProvider, RESEARCH_PROVIDER_IDS } from './factory'
import { ResearchNotConfiguredError } from './port'
import { buildResearchPrompt } from './prompt'

describe('createResearchProvider', () => {
  it('lists only the impls that ship', () => {
    expect(RESEARCH_PROVIDER_IDS).toEqual(['none', 'perplexity'])
  })

  it('builds the perplexity provider when a key is present', () => {
    const provider = createResearchProvider({
      providerId: 'perplexity',
      perplexity: { apiKey: 'pplx-test' },
    })
    expect(typeof provider.start).toBe('function')
  })

  it('refuses to build a keyless perplexity provider', () => {
    expect(() => createResearchProvider({ providerId: 'perplexity' })).toThrow(/PERPLEXITY_API_KEY/)
  })
})

describe('the noop provider', () => {
  // Reaching either method means a request got past the callback gate that is
  // supposed to make the feature *absent*. It fails by name so that shows up in
  // a log rather than as a job that never starts.
  it('refuses both methods with a named error', async () => {
    const provider = createResearchProvider({ providerId: 'none' })
    await expect(
      provider.start({ jobId: 'j', brandName: 'B', websiteUrl: 'u', model: 'm' }),
    ).rejects.toBeInstanceOf(ResearchNotConfiguredError)
    await expect(provider.poll('x')).rejects.toBeInstanceOf(ResearchNotConfiguredError)
  })

  it('says what to set, not just that it is off', async () => {
    const provider = createResearchProvider({ providerId: 'none' })
    await expect(provider.poll('x')).rejects.toThrow(/RESEARCH_PROVIDER/)
  })
})

describe('buildResearchPrompt', () => {
  it('asks for the suggested-section headings, so 3D has something to key on', () => {
    const prompt = buildResearchPrompt({
      brandName: 'Casa Vostra',
      websiteUrl: 'https://cv.example',
    })
    for (const label of [
      'Voice & tone',
      'Target audience',
      'Values & positioning',
      'Visual guidelines',
      'Messaging frameworks',
    ]) {
      expect(prompt).toContain(`## ${label}`)
    }
  })

  it('names the brand and its site — the hard URL gate, in the prompt', () => {
    const prompt = buildResearchPrompt({
      brandName: 'Casa Vostra',
      websiteUrl: 'https://cv.example',
    })
    expect(prompt).toContain('Casa Vostra')
    expect(prompt).toContain('https://cv.example')
  })

  // The three instructions 3A's live run justified. Losing any of them is a
  // silent quality regression that only shows up in a $0.38 run.
  it('keeps the three rules the live run earned', () => {
    const prompt = buildResearchPrompt({ brandName: 'B', websiteUrl: 'https://b.example' })
    expect(prompt).toMatch(/omit a heading entirely rather than guess/)
    expect(prompt).toMatch(/not hex values/)
    expect(prompt).toMatch(/say so plainly and stop/)
  })
})
