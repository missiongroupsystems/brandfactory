import { describe, expect, it } from 'vitest'
import type { LanguageModel } from 'ai'
import type { LLMProvider, LLMProviderSettings } from '@brandfactory/adapter-llm'
import {
  GUIDELINE_LABEL_MAX_CHARS,
  TLDR_TARGET_MAX_CHARS,
  type ResearchSource,
} from '@brandfactory/shared'
import { buildShapePrompt, DRAFT_TARGET_MAX_CHARS, shapeResearchIntoSections } from './shape'

// A minimal `LanguageModelV1` that answers `doGenerate` with a fixed JSON
// object — the slice `generateObject` actually calls. Same approach as
// `stream.test.ts`'s `fakeModel`, one method along.
interface DoGenerateOpts {
  prompt?: { role: string; content: unknown }[]
}

function fakeModel(object: unknown, capture?: { opts?: DoGenerateOpts }): LanguageModel {
  return {
    specificationVersion: 'v1' as const,
    provider: 'fake',
    modelId: 'fake-1',
    defaultObjectGenerationMode: 'json' as const,
    supportsImageUrls: false,
    supportsStructuredOutputs: false,
    doStream: () => {
      throw new Error('doStream should not be called by generateObject')
    },
    doGenerate: (opts: DoGenerateOpts) => {
      if (capture) capture.opts = opts
      return Promise.resolve({
        text: JSON.stringify(object),
        finishReason: 'stop' as const,
        usage: { promptTokens: 10, completionTokens: 10 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      })
    },
  } as unknown as LanguageModel
}

const settings: LLMProviderSettings = { providerId: 'anthropic', modelId: 'test' }
const provider = (model: LanguageModel): LLMProvider => ({
  getModel: () => model,
  // These tests drive `generateObject`. Nothing here grounds, so the method
  // refuses rather than returning an empty result — a fake that answered would
  // let a grounding regression pass as a model that found nothing.
  completeGrounded: () => Promise.reject(new Error('completeGrounded: not stubbed in this test')),
})

const CITATIONS: ResearchSource[] = [
  { title: 'About us', url: 'https://casavostra.example/about' },
  { title: 'Press', url: 'https://casavostra.example/press' },
]

const REPORT = '# Brand Profile\n\n## Voice & tone\n\nWarm, direct, a little wry.'

function shapeResult(object: unknown, capture?: { opts?: DoGenerateOpts }) {
  return shapeResearchIntoSections({
    brandName: 'Casa Vostra',
    report: REPORT,
    citations: CITATIONS,
    llmProvider: provider(fakeModel(object, capture)),
    llmSettings: settings,
  })
}

/**
 * Just the drafts. Most of these tests are about what *lands*, not about why —
 * the outcome vocabulary has its own describe below, which is the half that
 * exists so a zero-draft run is never again unexplainable in a log.
 */
async function shape(object: unknown, capture?: { opts?: DoGenerateOpts }) {
  return (await shapeResult(object, capture)).drafts
}

describe('shapeResearchIntoSections', () => {
  it('turns shaped sections into drafts, with both halves of the body', async () => {
    const drafts = await shape({
      sections: [
        {
          label: 'Voice & tone',
          markdown: 'Warm, direct, a little wry.\n\n- Never “culinary journey”',
          sourceUrls: ['https://casavostra.example/about'],
        },
      ],
    })

    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.label).toBe('Voice & tone')
    expect(drafts[0]!.html).toContain('<p>Warm, direct, a little wry.</p>')
    expect(drafts[0]!.html).toContain('<ul>')
    expect(drafts[0]!.text).toContain('Warm, direct')
    expect(drafts[0]!.sources).toEqual([CITATIONS[0]])
  })

  // The failure mode the whole citation design exists to catch. A plausible URL
  // the report never cited is exactly what a confabulating model produces.
  it('drops a source the report never cited', async () => {
    const drafts = await shape({
      sections: [
        {
          label: 'Target audience',
          markdown: 'People within a short walk.',
          sourceUrls: ['https://invented.example/made-up', 'https://casavostra.example/press'],
        },
      ],
    })
    expect(drafts[0]!.sources).toEqual([CITATIONS[1]])
  })

  // Citations are provenance for a reviewer, not a gate on the text: a section
  // whose every URL was dropped still lands, with none attached.
  it('keeps a section whose sources all failed to resolve', async () => {
    const drafts = await shape({
      sections: [
        { label: 'Values', markdown: 'Honest over hypey.', sourceUrls: ['https://nope.example'] },
      ],
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.sources).toEqual([])
  })

  it('drops a section with an empty body rather than offering an empty row', async () => {
    const drafts = await shape({
      sections: [
        { label: 'Voice & tone', markdown: '   \n\n  ', sourceUrls: [] },
        { label: 'Target audience', markdown: 'Households nearby.', sourceUrls: [] },
      ],
    })
    expect(drafts.map((d) => d.label)).toEqual(['Target audience'])
  })

  // Omitting is the point: a brand with nothing solid in the report should come
  // back with fewer sections, not with padded ones.
  // **The bound mismatch that would have cost a whole batch.** This boundary
  // allowed a 200-character label while `UpdateBrandGuidelinesSectionInputSchema`
  // — the drafts' only destination — allows 120. That wire takes the brand's
  // *complete* section list, so one long label 400'd the entire payload and lost
  // every draft beside it to a toast. Clamped, not rejected, for exactly that
  // reason: the cost has to fall on the one label, never on the batch.
  it('clamps an over-long label instead of failing the batch', async () => {
    const long = 'Messaging framework — '.repeat(20)
    expect(long.length).toBeGreaterThan(GUIDELINE_LABEL_MAX_CHARS)

    const drafts = await shape({
      sections: [
        { label: long, markdown: 'Compressed.', sourceUrls: [] },
        { label: 'Voice & tone', markdown: 'Warm.', sourceUrls: [] },
      ],
    })

    expect(drafts[0]!.label).toHaveLength(GUIDELINE_LABEL_MAX_CHARS)
    expect(long.startsWith(drafts[0]!.label)).toBe(true)
    // The one that was always fine is still there — that is the whole point.
    expect(drafts.map((d) => d.label)).toContain('Voice & tone')
  })

  // `min(1)` on the destination would refuse the batch for it.
  it('drops a label that is only whitespace', async () => {
    const drafts = await shape({
      sections: [
        { label: '   ', markdown: 'Body.', sourceUrls: [] },
        { label: 'Voice & tone', markdown: 'Warm.', sourceUrls: [] },
      ],
    })

    expect(drafts.map((d) => d.label)).toEqual(['Voice & tone'])
  })

  it('returns an empty list when the model omitted everything', async () => {
    expect(await shape({ sections: [] })).toEqual([])
  })

  // A shaping pass that fails is not a research run that failed — the caller
  // keeps the report and lands zero drafts.
  it('returns nothing when the model answers with the wrong shape', async () => {
    expect(await shape({ nonsense: true })).toEqual([])
  })

  it('sends the report as the prompt, so the model shapes what was found', async () => {
    const capture: { opts?: DoGenerateOpts } = {}
    await shape({ sections: [] }, capture)
    const user = capture.opts?.prompt?.find((m) => m.role === 'user')
    expect(JSON.stringify(user?.content)).toContain('Warm, direct, a little wry')
  })
})

// ---------------------------------------------------------------------------
// Why a pass produced nothing — the half that used to be unspeakable
// ---------------------------------------------------------------------------
//
// The first watched production run finished `COMPLETED` with zero drafts and
// left no log line to explain it: four of the five ways to reach an empty list
// returned rather than threw, and only the throw was reported. The completion
// notes for that release proposed diagnosing the next run by watching for
// `research shaping failed`, which on the most likely branch would never have
// appeared. These are the names that make the difference legible.

describe('shapeResearchIntoSections — the outcome', () => {
  it('is ok when at least one draft survives', async () => {
    const result = await shapeResult({
      sections: [{ label: 'Voice & tone', markdown: 'Warm.', sourceUrls: [] }],
    })
    expect(result.outcome).toBe('ok')
    expect(result.sectionsReturned).toBe(1)
    expect(result.reportChars).toBe(REPORT.length)
  })

  // The branch that most needed a name. A provider that ignores `response_format`
  // answers in prose, which parses to nothing and is a fact about *our*
  // configuration — which is why the caller logs this one at `error`.
  it('is invalid-shape when the model answered outside the schema', async () => {
    const result = await shapeResult({ nonsense: true })
    expect(result.outcome).toBe('invalid-shape')
    expect(result.drafts).toEqual([])
    // Nothing was returned to count, and claiming otherwise would send an
    // operator looking for sections the model never produced.
    expect(result.sectionsReturned).toBe(0)
  })

  // Rule 1 of the prompt is *omit rather than invent*, so this is the pass doing
  // as it was told over a report with nothing solid in it.
  it('is no-sections when the model correctly returned an empty list', async () => {
    const result = await shapeResult({ sections: [] })
    expect(result.outcome).toBe('no-sections')
    expect(result.sectionsReturned).toBe(0)
  })

  // The one this file is answerable for: sections came back and every one was
  // rejected here. Indistinguishable from an honest empty answer before now.
  it('is sections-dropped when this file rejected every section it was given', async () => {
    const result = await shapeResult({
      sections: [
        { label: 'Voice & tone', markdown: '   \n\n ', sourceUrls: [] },
        { label: '   ', markdown: 'Body.', sourceUrls: [] },
      ],
    })
    expect(result.outcome).toBe('sections-dropped')
    expect(result.drafts).toEqual([])
    // The count is what separates it from `no-sections` in a log line.
    expect(result.sectionsReturned).toBe(2)
  })
})

describe('buildShapePrompt', () => {
  const prompt = buildShapePrompt({ brandName: 'Casa Vostra', citations: CITATIONS })

  it('offers the suggested labels and the brand', () => {
    expect(prompt).toContain('Casa Vostra')
    for (const label of ['Voice & tone', 'Target audience', 'Visual guidelines']) {
      expect(prompt).toContain(label)
    }
  })

  // The three rules that are not style preferences: each one is a decision from
  // the locked document or from a measurement.
  it('states the omit rule, the compression target, and the no-colours rule', () => {
    expect(prompt).toMatch(/Omit a section rather than invent one/)
    expect(prompt).toContain(String(DRAFT_TARGET_MAX_CHARS))
    expect(prompt).toMatch(/No colour values/)
  })

  it('lists the citable URLs, because anything else is dropped', () => {
    expect(prompt).toContain('https://casavostra.example/about')
    expect(prompt).toContain('https://casavostra.example/press')
  })

  it('says so plainly when the report cited nothing', () => {
    expect(buildShapePrompt({ brandName: 'B', citations: [] })).toContain('- (none)')
  })

  // The batch pass has no `existingLabels` to invert — its neighbours are its
  // own output — so what it needs instead is a rule saying the two summary
  // labels read across the rest, and their own length.
  it('names the summary sections as reading across the whole report', () => {
    expect(prompt).toContain('"TL;DR" and "Overview" summarise across the whole report')
    expect(prompt).toMatch(/Rule 1 retires them only when the report has nothing in it at all/)
  })

  it('carries TL;DR’s own ceiling into the compression rule', () => {
    expect(prompt).toContain(`"TL;DR" is at most ${TLDR_TARGET_MAX_CHARS} characters`)
    expect(prompt).toContain(String(DRAFT_TARGET_MAX_CHARS))
  })
})
