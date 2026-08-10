import type { BrandId } from '@brandfactory/shared'
import { describe, expect, it } from 'vitest'
import { createFakeDb } from '../test-helpers'
import { createCopyWriter, createThemeIdeator } from './ideate'
import type { Env } from '../env'

// The seam, not the model. What is worth asserting here is exactly what the
// seam is for: the brand and its sections are loaded, the workspace's own model
// is resolved **at call time**, and a vanished brand throws rather than quietly
// planning for a nameless one.

const env = {
  LLM_PROVIDER: 'anthropic',
  LLM_MODEL: 'env-default-model',
} as Env

const BRIEF = {
  window: { start: '2026-08-01', end: '2026-08-31' },
  platforms: ['instagram'] as const,
  keyDates: [],
  taken: [],
  cadencePerWeek: 3,
  pillars: [],
  count: 6,
}

/** Captures what `generateObject` was handed, and answers with one idea. */
function captureModel(capture: { system?: string; modelId?: string }) {
  return {
    getModel: (settings: { modelId: string }) => {
      capture.modelId = settings.modelId
      return {
        specificationVersion: 'v1' as const,
        provider: 'fake',
        modelId: settings.modelId,
        defaultObjectGenerationMode: 'json' as const,
        supportsImageUrls: false,
        supportsStructuredOutputs: false,
        doStream: () => {
          throw new Error('doStream should not be called')
        },
        doGenerate: (opts: { prompt?: { role: string; content: unknown }[] }) => {
          const system = opts.prompt?.find((m) => m.role === 'system')?.content
          capture.system = typeof system === 'string' ? system : JSON.stringify(system)
          return Promise.resolve({
            text: JSON.stringify({ ideas: [], pillars: [], copies: [] }),
            finishReason: 'stop' as const,
            usage: { promptTokens: 1, completionTokens: 1 },
            rawCall: { rawPrompt: null, rawSettings: {} },
          })
        },
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

async function seed() {
  const { db, state } = createFakeDb()
  const workspace = await db.createWorkspace({ name: 'W', ownerUserId: 'u-1' as never })
  const brand = await db.createBrand({ workspaceId: workspace.id, name: 'Casa Vostra' })
  return { db, state, brand, workspaceId: workspace.id }
}

describe('createThemeIdeator', () => {
  it('hands the model the brand’s name and its written sections', async () => {
    const { db, brand } = await seed()
    await db.updateBrandGuidelines(brand.id, [
      {
        label: 'Voice & tone',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Warm, direct, wry.' }] }],
        },
        priority: 100,
        createdBy: 'user',
      },
    ])
    const capture: { system?: string } = {}
    const ideate = createThemeIdeator({ db, llm: captureModel(capture), env })

    await ideate({ ...BRIEF, platforms: ['instagram'], brandId: brand.id })

    expect(capture.system).toContain('Casa Vostra')
    expect(capture.system).toContain('Voice & tone')
    expect(capture.system).toContain('Warm, direct, wry.')
    // The brief rides on the same message, and the canvas contract does not.
    expect(capture.system).toContain('## Planning brief')
    expect(capture.system).not.toContain('Canvas awareness')
  })

  it('resolves the model at call time, so a settings change takes effect', async () => {
    const { db, brand, workspaceId } = await seed()
    const capture: { modelId?: string } = {}
    const ideate = createThemeIdeator({ db, llm: captureModel(capture), env })

    await ideate({ ...BRIEF, platforms: ['instagram'], brandId: brand.id })
    expect(capture.modelId).toBe('env-default-model')

    await db.upsertWorkspaceSettings({
      workspaceId,
      llmProviderId: 'anthropic',
      llmModel: 'the-model-they-chose',
    })

    // Same composed function, second call — the model that should write is the
    // one configured when the writing happens.
    await ideate({ ...BRIEF, platforms: ['instagram'], brandId: brand.id })
    expect(capture.modelId).toBe('the-model-they-chose')
  })

  it('throws when the brand has vanished between the access check and the call', async () => {
    const { db } = await seed()
    const ideate = createThemeIdeator({ db, llm: captureModel({}), env })
    await expect(
      ideate({ ...BRIEF, platforms: ['instagram'], brandId: 'b-gone' as BrandId }),
    ).rejects.toThrow(/not found/)
  })
})

describe('createCopyWriter', () => {
  it('loads the same brand and withholds the same contract', async () => {
    const { db, brand } = await seed()
    const capture: { system?: string } = {}
    const write = createCopyWriter({ db, llm: captureModel(capture), env })

    await write({
      brandId: brand.id,
      items: [
        {
          idea: {
            title: 'The pass',
            angle: 'Hands, steam.',
            pillar: null,
            date: null,
            platforms: ['instagram'],
            keyDateName: null,
            reason: 'It is the brand.',
          },
          platform: 'instagram',
        },
      ],
    })

    expect(capture.system).toContain('Casa Vostra')
    expect(capture.system).toContain('## Copywriting brief')
    expect(capture.system).not.toContain('Canvas awareness')
  })

  it('throws on a vanished brand', async () => {
    const { db } = await seed()
    const write = createCopyWriter({ db, llm: captureModel({}), env })
    await expect(
      write({
        brandId: 'b-gone' as BrandId,
        items: [
          {
            idea: {
              title: 't',
              angle: 'a',
              pillar: null,
              date: null,
              platforms: ['instagram'],
              keyDateName: null,
              reason: 'r',
            },
            platform: 'instagram',
          },
        ],
      }),
    ).rejects.toThrow(/not found/)
  })
})
