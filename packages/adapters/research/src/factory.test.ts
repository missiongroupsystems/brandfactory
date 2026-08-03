import { describe, expect, it } from 'vitest'
import { DRAFT_TARGET_MAX_CHARS } from '@brandfactory/shared'
import { createResearchProvider, RESEARCH_PROVIDER_IDS } from './factory'
import { ResearchNotConfiguredError } from './port'
import {
  buildResearchPrompt,
  buildSectionSearchPrompt,
  SECTION_NO_MATERIAL_SENTINEL,
} from './prompt'

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
  it('refuses all three methods with a named error', async () => {
    const provider = createResearchProvider({ providerId: 'none' })
    await expect(
      provider.start({ jobId: 'j', brandName: 'B', websiteUrl: 'u', model: 'm' }),
    ).rejects.toBeInstanceOf(ResearchNotConfiguredError)
    await expect(provider.poll('x')).rejects.toBeInstanceOf(ResearchNotConfiguredError)
    await expect(
      provider.searchSection({
        brandName: 'B',
        websiteUrl: 'https://b.example',
        label: 'Voice & tone',
        existingLabels: [],
        model: 'm',
      }),
    ).rejects.toBeInstanceOf(ResearchNotConfiguredError)
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

describe('buildSectionSearchPrompt', () => {
  const input = {
    brandName: 'Ebb & Flow Group',
    websiteUrl: 'https://www.ebbflowgroup.com',
    label: 'Voice & tone',
    description: 'How the brand sounds — personality, phrasing rules, do/don’t examples.',
    existingLabels: ['Target audience', 'Values & positioning'],
  }

  it('names the brand, its site and the one section being written', () => {
    const prompt = buildSectionSearchPrompt(input)
    expect(prompt).toContain('Ebb & Flow Group')
    expect(prompt).toContain('https://www.ebbflowgroup.com')
    expect(prompt).toContain('"Voice & tone" section')
  })

  it('interpolates the section description when one is supplied, and skips the line when not', () => {
    expect(buildSectionSearchPrompt(input)).toContain(
      'Voice & tone: How the brand sounds — personality, phrasing rules, do/don’t examples.',
    )
    const bare = buildSectionSearchPrompt({ ...input, description: undefined })
    expect(bare).not.toContain('Voice & tone: How')
  })

  it('tells the model what the guidelines already cover, and omits the line for a fresh brand', () => {
    expect(buildSectionSearchPrompt(input)).toContain(
      'already have sections for: Target audience, Values & positioning',
    )
    expect(buildSectionSearchPrompt({ ...input, existingLabels: [] })).not.toContain(
      'already have sections',
    )
  })

  // The rules the A0 spike's captured run followed. The first is why 1.18.0's
  // citation chips have no work to do inside a TipTap row.
  it('keeps the section-sized versions of the load-bearing rules', () => {
    const prompt = buildSectionSearchPrompt(input)
    expect(prompt).toMatch(/citation markers like \[1\]/)
    expect(prompt).toMatch(/hex colour values/)
    // Stated to the model, measured here — the same rule as the shaping pass.
    expect(prompt).toContain(String(DRAFT_TARGET_MAX_CHARS))
  })

  // **The Phase E live pass's finding.** This rule used to read "say so plainly
  // and stop" — inherited from the deep prompt, where a paragraph explaining
  // that the site gave too little is a useful artefact for a human reader. For
  // a section it is a disaster: the vendor obeyed, wrote 600 characters of
  // honest refusal, and the service had no way to tell that prose from a
  // section. It reached the client as a successful draft.
  //
  // A sentinel is the machine-checkable form of the same honesty, and the
  // prompt must demand it *exclusively* — "and nothing else" is the half that
  // keeps a refusal from arriving wrapped in an apology.
  it('demands the no-material sentinel rather than a plain-language refusal', () => {
    const prompt = buildSectionSearchPrompt(input)
    expect(prompt).toContain(SECTION_NO_MATERIAL_SENTINEL)
    expect(prompt).toMatch(/and nothing else/)
    expect(prompt).not.toMatch(/say so plainly and stop/)
  })
})
