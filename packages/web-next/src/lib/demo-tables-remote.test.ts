import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type * as Ideas from '@/data/ideas'
import type * as Stories from '@/features/schedule/stories'

// On the core. Production's casa-vostra and temper share ids with demo brands: a static table
// read by id alone gives them the demo's invented rows. The flag is read when a module loads.
let ideas: typeof Ideas
let stories: typeof Stories
beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_CORE_URL', 'https://core.test')
  vi.resetModules()
  ideas = await import('@/data/ideas')
  stories = await import('@/features/schedule/stories')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('static demo tables on the core', () => {
  it("names a story already out plainly, not with the demo's titles", () => {
    const out = stories.storiesOf(
      '2026-10-16',
      { posts: [], ideas: [], storiesPosted: 2 },
      'casa-vostra',
      [],
      () => undefined,
    )
    expect(out.map((s) => s.title)).toEqual(['Story', 'Story'])
  })

  it("holds no moodboard for a brand until the server sends one, never the demo's", () => {
    for (const id of ['casa-vostra', 'chin-mee-chin'] as const) {
      const board = ideas.moodboardOf(id as 'casa-vostra')
      expect(board).toEqual({ references: [], boards: [] })
    }
  })
})
