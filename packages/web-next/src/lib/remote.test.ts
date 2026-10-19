import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { approve } from './remote'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CORE_URL = 'http://core.test'
})

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('approve', () => {
  it('puts only a move name in the path: the name came from the model', async () => {
    // Anything else could point the yes at another route on the core.
    for (const bad of ['../ops/brandbase/post.schedule', 'post.schedule?x=1', 'Post.Schedule', ''])
      await expect(approve(bad, {})).rejects.toMatchObject({ code: 'BAD_MOVE' })
    expect(fetch).not.toHaveBeenCalled()
    await approve('post.create_draft', { id: 'p1' })
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
      'http://core.test/approve/brandbase/post.create_draft',
    )
  })
})
