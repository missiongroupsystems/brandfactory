import { describe, expect, it } from 'vitest'
import type { LanguageModel } from 'ai'
import type { LLMProvider, LLMProviderSettings } from '@brandfactory/adapter-llm'
import type {
  BrandId,
  BrandWithSections,
  IdeateThemesInput,
  PostIdea,
  SectionId,
} from '@brandfactory/shared'
import {
  applyBoundaries,
  buildCopyPrompt,
  buildThemesPrompt,
  ideatePostThemes,
  writePostCopy,
} from './ideate'

// The same minimal `doGenerate` fake `shapeSection.test.ts` uses — the slice
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

const BRAND: BrandWithSections = {
  id: 'b-1' as BrandId,
  workspaceId: 'w-1' as BrandWithSections['workspaceId'],
  name: 'Casa Vostra',
  description: 'A neighbourhood trattoria.',
  websiteUrl: null,
  linkedToPassport: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  sections: [
    {
      id: 's-1' as SectionId,
      brandId: 'b-1' as BrandId,
      label: 'Voice & tone',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Warm, direct, wry.' }] }],
      },
      priority: 100,
      createdBy: 'user',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
}

const BRIEF: IdeateThemesInput = {
  window: { start: '2026-08-01', end: '2026-08-31' },
  platforms: ['instagram', 'linkedin'],
  keyDates: [
    {
      name: 'National Day',
      start: '2026-08-09',
      set: 'Singapore holidays',
      note: 'Public holiday',
    },
    {
      name: 'Hungry Ghost month',
      start: '2026-08-01',
      end: '2026-08-30',
      set: 'Singapore holidays',
    },
  ],
  taken: [{ day: '2026-08-03', platform: 'instagram' }],
  cadencePerWeek: 3,
  pillars: ['Behind the pass', 'The room'],
  count: 4,
}

function idea(over: Partial<PostIdea> = {}): PostIdea {
  return {
    title: 'The pass at 6pm',
    angle: 'Hands, steam, no faces.',
    pillar: 'Behind the pass',
    date: '2026-08-12',
    platforms: ['instagram'],
    keyDateName: null,
    reason: 'The room is loudest before service.',
    ...over,
  }
}

function themes(
  object: unknown,
  brief: IdeateThemesInput = BRIEF,
  capture?: { opts?: DoGenerateOpts },
) {
  return ideatePostThemes({
    ...brief,
    brand: BRAND,
    llmProvider: provider(fakeModel(object, capture)),
    llmSettings: settings,
  })
}

describe('buildThemesPrompt', () => {
  it('names the window, the cadence and every platform', () => {
    const prompt = buildThemesPrompt(BRIEF)
    expect(prompt).toContain('2026-08-01 to 2026-08-31')
    expect(prompt).toContain('3 times a week')
    expect(prompt).toContain('instagram, linkedin')
    expect(prompt).toContain('Propose 4 ideas')
  })

  it('quotes every key date, with its set, its span and its note', () => {
    const prompt = buildThemesPrompt(BRIEF)
    expect(prompt).toContain('2026-08-09 — National Day (Singapore holidays) — Public holiday')
    // A season arrives as a span, not as its first day.
    expect(prompt).toContain('2026-08-01 to 2026-08-30 — Hungry Ghost month')
  })

  it('lists every taken day and platform', () => {
    expect(buildThemesPrompt(BRIEF)).toContain('- 2026-08-03 — instagram')
  })

  it('names the brand’s own pillars when it has them', () => {
    const prompt = buildThemesPrompt(BRIEF)
    expect(prompt).toContain('- Behind the pass')
    expect(prompt).toContain('- The room')
    expect(prompt).not.toContain('has not written its content pillars')
  })

  it('asks for pillars when the brand has none', () => {
    const prompt = buildThemesPrompt({ ...BRIEF, pillars: [] })
    expect(prompt).toContain('has not written its content pillars')
    expect(prompt).toContain('three to five')
  })

  it('carries the media rule first, and it is about words not assets', () => {
    const prompt = buildThemesPrompt(BRIEF)
    expect(prompt).toContain('Never name, invent or select an asset')
  })
})

describe('buildCopyPrompt', () => {
  const items = [
    { idea: idea(), platform: 'instagram' as const },
    { idea: idea({ title: 'Sourcing' }), platform: 'linkedin' as const },
  ]

  it('numbers the items from zero and names each platform', () => {
    const prompt = buildCopyPrompt({ items })
    expect(prompt).toContain('0. [instagram] The pass at 6pm')
    expect(prompt).toContain('1. [linkedin] Sourcing')
  })

  it('tells the model the whole set is visible, so the openings can vary', () => {
    expect(buildCopyPrompt({ items })).toContain('Vary the openings')
  })
})

describe('the brand header', () => {
  it('is `buildSystemPrompt`’s, without the canvas contract', async () => {
    const capture: { opts?: DoGenerateOpts } = {}
    await themes({ ideas: [idea()], pillars: [] }, BRIEF, capture)
    const system = capture.opts?.prompt?.find((m) => m.role === 'system')?.content
    const text = typeof system === 'string' ? system : JSON.stringify(system)
    // Parts 1–3: the brand and its written sections.
    expect(text).toContain('Casa Vostra')
    expect(text).toContain('Voice & tone')
    expect(text).toContain('Warm, direct, wry.')
    // Part 4 withheld — there is no canvas here and no tool to call.
    expect(text).not.toContain('Canvas awareness')
    expect(text).not.toContain('add_canvas_block')
    // And the brief rides on the same message.
    expect(text).toContain('Planning brief')
  })
})

describe('applyBoundaries', () => {
  it('drops an idea dated outside the window', () => {
    const kept = applyBoundaries([idea({ date: '2026-09-02' })], BRIEF)
    expect(kept).toEqual([])
  })

  it('keeps an idea on the window’s first and last day', () => {
    const kept = applyBoundaries(
      [idea({ date: '2026-08-01' }), idea({ date: '2026-08-31' })],
      BRIEF,
    )
    expect(kept).toHaveLength(2)
  })

  it('drops an idea proposed onto a taken day and platform', () => {
    const kept = applyBoundaries([idea({ date: '2026-08-03', platforms: ['instagram'] })], BRIEF)
    expect(kept).toEqual([])
  })

  it('keeps the same day on a platform that is still free — full is per pair', () => {
    // 3 August is taken on Instagram and open on LinkedIn. A planner that
    // treated the day as full would refuse a normal Tuesday.
    const kept = applyBoundaries(
      [idea({ date: '2026-08-03', platforms: ['instagram', 'linkedin'] })],
      BRIEF,
    )
    expect(kept[0]?.platforms).toEqual(['linkedin'])
  })

  it('drops a platform the request never asked for', () => {
    const kept = applyBoundaries([idea({ platforms: ['tiktok', 'instagram'] })], BRIEF)
    expect(kept[0]?.platforms).toEqual(['instagram'])
  })

  it('drops an idea whose every platform was filtered out', () => {
    expect(applyBoundaries([idea({ platforms: ['tiktok'] })], BRIEF)).toEqual([])
  })

  it('never applies the taken rule to a dateless idea', () => {
    // A tray idea occupies no slot, so it cannot collide with one.
    const kept = applyBoundaries([idea({ date: null, platforms: ['instagram'] })], BRIEF)
    expect(kept).toHaveLength(1)
  })

  it('clamps to the requested count', () => {
    // A distinct day each, so the clamp is what this measures and not the
    // day+platform dedup below.
    const kept = applyBoundaries(
      Array.from({ length: 9 }, (_, i) =>
        idea({ title: `idea ${i}`, date: `2026-08-${String(i + 10).padStart(2, '0')}` }),
      ),
      BRIEF,
    )
    expect(kept).toHaveLength(4)
  })

  it('drops a second idea landing on a day and platform an earlier one claimed', () => {
    // The model cannot see its own answer as a set while it writes it, so two
    // cards on one slot is a shape the prompt cannot rule out. Unfiltered, both
    // commit, and the grid stacks two posts in a cell the summary calls full.
    const kept = applyBoundaries(
      [
        idea({ title: 'first', date: '2026-08-12', platforms: ['instagram'] }),
        idea({ title: 'second', date: '2026-08-12', platforms: ['instagram'] }),
      ],
      BRIEF,
    )
    expect(kept.map((k) => k.title)).toEqual(['first'])
  })

  it('claims only the platforms that survived, per idea', () => {
    // The first idea keeps LinkedIn only (Instagram on the 3rd is taken), so
    // the second may still use Instagram on a different day.
    const kept = applyBoundaries(
      [
        idea({ title: 'first', date: '2026-08-03', platforms: ['instagram', 'linkedin'] }),
        idea({ title: 'second', date: '2026-08-04', platforms: ['instagram'] }),
      ],
      BRIEF,
    )
    expect(kept.map((k) => [k.title, k.platforms])).toEqual([
      ['first', ['linkedin']],
      ['second', ['instagram']],
    ])
  })

  it('narrows a colliding idea to its free platforms rather than dropping it', () => {
    const kept = applyBoundaries(
      [
        idea({ title: 'first', date: '2026-08-12', platforms: ['instagram'] }),
        idea({ title: 'second', date: '2026-08-12', platforms: ['instagram', 'linkedin'] }),
      ],
      BRIEF,
    )
    expect(kept.map((k) => [k.title, k.platforms])).toEqual([
      ['first', ['instagram']],
      ['second', ['linkedin']],
    ])
  })

  it('never lets two dateless ideas collide — the tray has no slots', () => {
    const kept = applyBoundaries(
      [
        idea({ title: 'first', date: null, platforms: ['instagram'] }),
        idea({ title: 'second', date: null, platforms: ['instagram'] }),
      ],
      BRIEF,
    )
    expect(kept).toHaveLength(2)
  })
})

describe('ideatePostThemes', () => {
  it('returns the ideas and the brand’s own pillars, unmarked', async () => {
    const result = await themes({ ideas: [idea()], pillars: ['Something the model made up'] })
    expect(result.outcome).toBe('ok')
    expect(result.ideas).toHaveLength(1)
    // The brand wrote its pillars, so the model's list is not the answer and
    // nothing is marked proposed.
    expect(result.pillars).toEqual([
      { name: 'Behind the pass', proposed: false },
      { name: 'The room', proposed: false },
    ])
  })

  it('marks the model’s pillars proposed when the brand has none', async () => {
    const result = await themes(
      { ideas: [idea()], pillars: ['Behind the pass'] },
      {
        ...BRIEF,
        pillars: [],
      },
    )
    expect(result.pillars).toEqual([{ name: 'Behind the pass', proposed: true }])
  })

  it('reports `no-ideas` for an empty list', async () => {
    const result = await themes({ ideas: [], pillars: [] })
    expect(result).toEqual({ ideas: [], pillars: [], outcome: 'no-ideas' })
  })

  it('reports `no-ideas` when every idea was filtered out', async () => {
    // In schema and useless is the same answer to the user as nothing at all.
    const result = await themes({ ideas: [idea({ date: '2026-12-25' })], pillars: [] })
    expect(result.outcome).toBe('no-ideas')
  })

  it('reports `invalid-shape` for an off-schema answer', async () => {
    const result = await themes({ suggestions: ['post about the food'] })
    expect(result).toEqual({ ideas: [], pillars: [], outcome: 'invalid-shape' })
  })

  it('keeps the good ideas when one of them is malformed', async () => {
    // The bound the batch used to die on: `angle` is capped at 600 characters,
    // the prompt never says so, and tool-use decoding does not enforce it. One
    // verbose card must not cost the user the other two and the whole call.
    const result = await themes({
      ideas: [
        idea({ title: 'good' }),
        idea({ title: 'verbose', date: '2026-08-13', angle: 'x'.repeat(601) }),
        idea({ title: 'also good', date: '2026-08-14' }),
      ],
      pillars: [],
    })
    expect(result.outcome).toBe('ok')
    expect(result.ideas.map((i) => i.title)).toEqual(['good', 'also good'])
  })

  it('drops an idea missing a nullable field, and keeps the rest', async () => {
    // `pillar`, `date` and `keyDateName` are nullable but not optional, so an
    // omitted one is off-schema for that idea alone.
    const result = await themes({
      ideas: [
        { ...idea({ title: 'no pillar key' }), pillar: undefined },
        idea({ title: 'good', date: '2026-08-14' }),
      ],
      pillars: [],
    })
    expect(result.ideas.map((i) => i.title)).toEqual(['good'])
  })

  it('reports `invalid-shape` only when every idea failed', async () => {
    const result = await themes({
      ideas: [idea({ angle: 'x'.repeat(601) }), idea({ title: 'y'.repeat(121) })],
      pillars: [],
    })
    expect(result).toEqual({ ideas: [], pillars: [], outcome: 'invalid-shape' })
  })

  it('keeps `no-ideas` distinct from `invalid-shape` on an empty list', async () => {
    // An empty array is the model answering that it has nothing, and that is a
    // fact about the month. Losing every idea is a fact about the model. The
    // panel has a different line for each, so they must not collapse.
    expect((await themes({ ideas: [], pillars: [] })).outcome).toBe('no-ideas')
  })

  it('drops a malformed pillar rather than the ideas beside it', async () => {
    const result = await themes(
      { ideas: [idea()], pillars: ['Behind the pass', 'z'.repeat(200)] },
      { ...BRIEF, pillars: [] },
    )
    expect(result.outcome).toBe('ok')
    expect(result.pillars).toEqual([{ name: 'Behind the pass', proposed: true }])
  })

  it('enforces the boundaries the prompt asks for', async () => {
    const result = await themes({
      ideas: [
        idea({ title: 'good' }),
        idea({ title: 'outside', date: '2026-09-15' }),
        idea({ title: 'taken', date: '2026-08-03', platforms: ['instagram'] }),
      ],
      pillars: [],
    })
    expect(result.ideas.map((i) => i.title)).toEqual(['good'])
  })
})

describe('writePostCopy', () => {
  const items = [
    { idea: idea(), platform: 'instagram' as const },
    { idea: idea({ title: 'Sourcing' }), platform: 'linkedin' as const },
  ]

  function copy(object: unknown) {
    return writePostCopy({
      items,
      brand: BRAND,
      llmProvider: provider(fakeModel(object)),
      llmSettings: settings,
    })
  }

  it('returns one entry per requested item, in request order', async () => {
    const result = await copy({
      copies: [
        { index: 1, body: 'Second.', mediaDirection: 'A crate of tomatoes.' },
        { index: 0, body: 'First.', mediaDirection: 'Hands at the pass.' },
      ],
    })
    expect(result.outcome).toBe('ok')
    expect(result.copies.map((c) => c.body)).toEqual(['First.', 'Second.'])
  })

  it('commits a missing index as an empty body, never as a dropped row', async () => {
    // `''` is already this product's *slot claimed, copy pending*. The user
    // agreed to the post; losing it would throw away the decision, not the
    // caption.
    const result = await copy({ copies: [{ index: 0, body: 'First.', mediaDirection: '' }] })
    expect(result.copies).toHaveLength(2)
    expect(result.copies[1]).toEqual({ index: 1, body: '', mediaDirection: '' })
  })

  it('ignores an index the request never asked about', async () => {
    const result = await copy({
      copies: [
        { index: 0, body: 'First.', mediaDirection: '' },
        { index: 7, body: 'Nowhere.', mediaDirection: '' },
      ],
    })
    expect(result.copies).toHaveLength(2)
    expect(result.copies.some((c) => c.body === 'Nowhere.')).toBe(false)
  })

  it('keeps the first answer when the model repeats an index', async () => {
    const result = await copy({
      copies: [
        { index: 0, body: 'First.', mediaDirection: '' },
        { index: 0, body: 'Also first.', mediaDirection: '' },
      ],
    })
    expect(result.copies[0]?.body).toBe('First.')
  })

  it('clamps an over-long caption rather than losing the whole pass', async () => {
    const result = await copy({
      copies: [{ index: 0, body: 'x'.repeat(6000), mediaDirection: '' }],
    })
    expect(result.copies[0]?.body).toHaveLength(5000)
  })

  it('reports `no-ideas` when nothing usable came back', async () => {
    expect((await copy({ copies: [] })).outcome).toBe('no-ideas')
  })

  it('reports `invalid-shape` for an off-schema answer', async () => {
    expect((await copy({ captions: ['hello'] })).outcome).toBe('invalid-shape')
  })
})
