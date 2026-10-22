import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { approve, loadAll, onAccount } from './remote'

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

describe('loadAll', () => {
  it('reads a core on brandbase 1.4.0, whose /me has no companies, as managing none', async () => {
    // The site may meet that core while 1.5.0 is being applied: it must load, with no Add brand.
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith('/me')
        ? new Response(JSON.stringify({ user: { id: 'u' }, brands: [] }), { status: 200 })
        : new Response('[]', { status: 200 }),
    )
    await expect(loadAll()).resolves.toEqual([])
    let companies: unknown = null
    onAccount((a) => (companies = a.companies))()
    expect(companies).toEqual([])
  })
})
