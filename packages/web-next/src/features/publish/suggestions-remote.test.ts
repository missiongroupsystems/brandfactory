import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type * as Suggestions from './suggestions'

// On the core. Production's casa-vostra has the demo brand's id, so a lookup by id alone finds
// the demo's invented creators, tags, places and hashtags. The flag is read when the module loads.
let s: typeof Suggestions
beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_CORE_URL', 'https://core.test')
  vi.resetModules()
  s = await import('./suggestions')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('suggestions on the core', () => {
  it('offers none of the demo data for casa-vostra', () => {
    expect(s.peopleOf('casa-vostra', 'caption')).toEqual([])
    expect(s.placesOf('casa-vostra')).toEqual([])
    expect(s.labelsOf('casa-vostra')).toEqual([])
    expect(s.hashtagsOf('casa-vostra')).toEqual([])
  })
})
