import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { IdeateThemesInput } from '@brandfactory/shared'

const themesPost = vi.fn()
const copyPost = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    brands: {
      ':id': {
        ideate: {
          themes: { $post: (...args: unknown[]) => themesPost(...args) },
          copy: { $post: (...args: unknown[]) => copyPost(...args) },
        },
      },
    },
  },
  callJson: async (res: { body: unknown }) => res.body,
}))

const { useIdeateCopy, useIdeateThemes } = await import('./social-ideas')

const BRAND_ID = '22222222-2222-4222-8222-222222222222'

const INPUT: IdeateThemesInput = {
  window: { start: '2026-08-01', end: '2026-08-31' },
  platforms: ['instagram'],
  keyDates: [],
  taken: [{ day: '2026-08-03', platform: 'instagram' }],
  cadencePerWeek: 3,
  pillars: [],
  count: 12,
}

let qc: QueryClient

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('useIdeateThemes', () => {
  it('posts the brief to the brand’s own route and returns the parsed answer', async () => {
    const result = { ideas: [], pillars: [], outcome: 'no-ideas' }
    themesPost.mockResolvedValue({ body: result })

    const hook = renderHook(() => useIdeateThemes(BRAND_ID), { wrapper })
    await hook.result.current.mutateAsync(INPUT)

    expect(themesPost).toHaveBeenCalledWith({ param: { id: BRAND_ID }, json: INPUT })
    await waitFor(() => expect(hook.result.current.data).toEqual(result))
  })

  /**
   * The design claim, asserted rather than described: the route persists
   * nothing, so there is no resource to keep coherent — and a cache write here
   * would be a second copy of an answer nobody can refetch.
   */
  it('writes nothing into the query cache', async () => {
    themesPost.mockResolvedValue({ body: { ideas: [], pillars: [], outcome: 'ok' } })
    const hook = renderHook(() => useIdeateThemes(BRAND_ID), { wrapper })
    await hook.result.current.mutateAsync(INPUT)

    expect(qc.getQueryCache().getAll()).toHaveLength(0)
  })
})

describe('useIdeateCopy', () => {
  it('posts the accepted pairs and returns the captions', async () => {
    const result = { copies: [{ index: 0, body: 'A caption', mediaDirection: '' }], outcome: 'ok' }
    copyPost.mockResolvedValue({ body: result })
    const items = [
      {
        idea: {
          title: 'The pass',
          angle: 'Hands in frame',
          pillar: null,
          date: null,
          platforms: ['instagram' as const],
          keyDateName: null,
          reason: '',
        },
        platform: 'instagram' as const,
      },
    ]

    const hook = renderHook(() => useIdeateCopy(BRAND_ID), { wrapper })
    const answer = await hook.result.current.mutateAsync({ items })

    expect(copyPost).toHaveBeenCalledWith({ param: { id: BRAND_ID }, json: { items } })
    expect(answer).toEqual(result)
    expect(qc.getQueryCache().getAll()).toHaveLength(0)
  })
})
