import { describe, expect, it } from 'vitest'
import type { LanguageModel } from 'ai'
import type { LLMProvider, LLMProviderSettings } from '@brandfactory/adapter-llm'
import { DRAFT_TARGET_MAX_CHARS, type ResearchSource } from '@brandfactory/shared'
import {
  buildSectionShapePrompt,
  shapeSectionFromReport,
  stripCitationMarkers,
} from './shapeSection'

// The same minimal `doGenerate` fake as `shape.test.ts` — the slice
// `generateObject` actually calls, answering with a fixed JSON object.
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
const provider = (model: LanguageModel): LLMProvider => ({ getModel: () => model })

const CITATIONS: ResearchSource[] = [
  { title: 'About us', url: 'https://casavostra.example/about' },
  { title: 'Press', url: 'https://casavostra.example/press' },
]

const REPORT = '# Brand Profile\n\n## Voice & tone\n\nWarm, direct, a little wry.'

function shapeSection(object: unknown, capture?: { opts?: DoGenerateOpts }) {
  return shapeSectionFromReport({
    brandName: 'Casa Vostra',
    label: 'Voice & tone',
    existingLabels: ['Target audience'],
    report: REPORT,
    citations: CITATIONS,
    llmProvider: provider(fakeModel(object, capture)),
    llmSettings: settings,
  })
}

describe('shapeSectionFromReport', () => {
  it('turns the body into a draft carrying the input label, not a model-named one', async () => {
    const result = await shapeSection({
      markdown: 'Warm, direct, a little wry.\n\n- Never “culinary journey”',
      sourceUrls: ['https://casavostra.example/about'],
    })

    expect(result.outcome).toBe('ok')
    expect(result.reportChars).toBe(REPORT.length)
    expect(result.draft!.label).toBe('Voice & tone')
    expect(result.draft!.html).toContain('<p>Warm, direct, a little wry.</p>')
    expect(result.draft!.html).toContain('<ul>')
    expect(result.draft!.text).toContain('Warm, direct')
    expect(result.draft!.sources).toEqual([CITATIONS[0]])
  })

  // The failure mode the citation design exists to catch, same as the batch
  // shaper: an invented-but-plausible URL is dropped, the cited one survives.
  it('drops a source the report never cited and keeps the rest', async () => {
    const result = await shapeSection({
      markdown: 'People within a short walk.',
      sourceUrls: ['https://invented.example/made-up', 'https://casavostra.example/press'],
    })
    expect(result.draft!.sources).toEqual([CITATIONS[1]])
  })

  // Belt and braces on top of the prompt's rule 6: markers a TipTap row would
  // render as debris are stripped; a real link is not a marker and survives.
  it('strips [n] markers from both halves of the body but leaves links alone', async () => {
    const result = await shapeSection({
      markdown: 'Uncompromising quality.[1][2] See [our story](https://casavostra.example/about).',
      sourceUrls: [],
    })
    expect(result.draft!.text).toBe('Uncompromising quality. See our story.')
    expect(result.draft!.html).toContain('<a href="https://casavostra.example/about">our story</a>')
    expect(result.draft!.html).not.toContain('[1]')
  })

  // The in-schema honest answer: an empty `markdown` is the model saying the
  // report has nothing solid for this label, and the client owns the toast.
  it('is no-material when the model returned an empty body', async () => {
    const result = await shapeSection({ markdown: '', sourceUrls: [] })
    expect(result.outcome).toBe('no-material')
    expect(result.draft).toBeNull()
    expect(result.reportChars).toBe(REPORT.length)
  })

  // Whitespace or markers-only collapse to the same nothing after
  // post-processing — one outcome, because there is one honest toast.
  it('is no-material when the body is empty once markers are stripped', async () => {
    const result = await shapeSection({ markdown: ' [1][2] \n ', sourceUrls: [] })
    expect(result.outcome).toBe('no-material')
    expect(result.draft).toBeNull()
  })

  // A provider that ignores `response_format` answers in prose — a fact about
  // our configuration, not about the brand, and named apart for it.
  it('is invalid-shape when the model answered outside the schema', async () => {
    const result = await shapeSection({ nonsense: true })
    expect(result.outcome).toBe('invalid-shape')
    expect(result.draft).toBeNull()
  })

  it('sends the report as the prompt, so the model extracts what was found', async () => {
    const capture: { opts?: DoGenerateOpts } = {}
    await shapeSection({ markdown: '', sourceUrls: [] }, capture)
    const user = capture.opts?.prompt?.find((m) => m.role === 'user')
    expect(JSON.stringify(user?.content)).toContain('Warm, direct, a little wry')
  })
})

describe('stripCitationMarkers', () => {
  it('removes markers and the space that carried them, in runs or alone', () => {
    expect(stripCitationMarkers('Quality. [1] Craft.[2][12]')).toBe('Quality. Craft.')
  })

  it('leaves markdown links and non-numeric brackets untouched', () => {
    expect(stripCitationMarkers('[3](https://a.example) and [TBD]')).toBe(
      '[3](https://a.example) and [TBD]',
    )
  })
})

describe('buildSectionShapePrompt', () => {
  const base = {
    brandName: 'Casa Vostra',
    label: 'Voice & tone',
    existingLabels: ['Target audience', 'Values'],
    citations: CITATIONS,
  }
  const prompt = buildSectionShapePrompt(base)

  it('names the brand and the one section being written', () => {
    expect(prompt).toContain('Casa Vostra')
    expect(prompt).toContain('"Voice & tone" section only')
  })

  // The section-sized forms of the load-bearing rules: the honest empty answer,
  // the measured target, no colours, no markers.
  it('states the empty-rather-than-invent rule, the target length, and both exclusions', () => {
    expect(prompt).toMatch(/empty markdown string rather than invent/)
    expect(prompt).toContain(String(DRAFT_TARGET_MAX_CHARS))
    expect(prompt).toMatch(/No colour values/)
    expect(prompt).toMatch(/markers like \[1\]/)
  })

  it('lists the citable URLs, and says so plainly when there are none', () => {
    expect(prompt).toContain('https://casavostra.example/about')
    expect(prompt).toContain('https://casavostra.example/press')
    expect(buildSectionShapePrompt({ ...base, citations: [] })).toContain('- (none)')
  })

  it('renders the description line and the existing-labels line only when supplied', () => {
    expect(prompt).toContain('Target audience, Values')
    expect(prompt).not.toContain('Voice & tone:')

    const withDescription = buildSectionShapePrompt({
      ...base,
      description: 'How the brand sounds.',
      existingLabels: [],
    })
    expect(withDescription).toContain('Voice & tone: How the brand sounds.')
    expect(withDescription).not.toContain('already have sections')
  })
})
