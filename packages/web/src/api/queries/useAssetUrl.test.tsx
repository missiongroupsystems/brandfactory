import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BrandAsset } from '@brandfactory/shared'
import { useAssetUrl } from './assets'
import { blobKeys } from './blobs'

const BRAND_ID = '22222222-2222-4222-8222-222222222222'
const T0 = '2026-07-29T00:00:00.000Z'

function asset(over: Partial<BrandAsset>): BrandAsset {
  return {
    id: 'a-1' as BrandAsset['id'],
    brandId: BRAND_ID as BrandAsset['brandId'],
    kind: 'image',
    role: 'logo',
    status: 'active',
    label: 'Mark',
    position: 100,
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  } as BrandAsset
}

let qc: QueryClient

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAssetUrl', () => {
  it('returns null for no asset', () => {
    const { result } = renderHook(() => useAssetUrl(null), { wrapper })
    expect(result.current).toBeNull()
  })

  // A colour has no URL and never wanted one. A caller that asks a swatch for
  // one has confused two kinds.
  it('returns null for an inline colour', () => {
    const { result } = renderHook(
      () => useAssetUrl(asset({ kind: 'color', source: 'inline', value: '#b5573c' })),
      { wrapper },
    )
    expect(result.current).toBeNull()
  })

  it('passes a link straight through, with no request', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(
      () => useAssetUrl(asset({ source: 'link', url: 'https://cdn.example.com/mark.svg' })),
      { wrapper },
    )
    expect(result.current).toBe('https://cdn.example.com/mark.svg')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /**
   * The pending blob is the state that matters most, because it is the one the
   * page opens in. Returning `''` here would put an `<img src="">` in the
   * monogram's box — which browsers resolve against the current document and
   * then fail, so the mark would flicker through a broken image on every load.
   * `null` means the caller renders exactly what it renders with no asset.
   */
  it('returns null for a blob whose signed URL has not arrived', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const { result } = renderHook(
      () => useAssetUrl(asset({ source: 'blob', blobKey: 'brands/mark.svg' })),
      { wrapper },
    )
    expect(result.current).toBeNull()
  })

  it('returns the signed URL once it resolves', async () => {
    qc.setQueryData(blobKeys.readUrl('brands/mark.svg'), 'https://storage.test/signed?token=abc')
    const { result } = renderHook(
      () => useAssetUrl(asset({ source: 'blob', blobKey: 'brands/mark.svg' })),
      { wrapper },
    )
    await waitFor(() => expect(result.current).toBe('https://storage.test/signed?token=abc'))
  })

  // The signed URL expires in five minutes and `useSignedReadUrl` refreshes it
  // on a 4-minute interval. Re-signing must reach the consumer, or a page left
  // open renders a mark that 403s on the next repaint.
  it('follows the signed URL when it is re-signed', async () => {
    qc.setQueryData(blobKeys.readUrl('brands/mark.svg'), 'https://storage.test/signed?token=one')
    const { result } = renderHook(
      () => useAssetUrl(asset({ source: 'blob', blobKey: 'brands/mark.svg' })),
      { wrapper },
    )
    await waitFor(() => expect(result.current).toContain('token=one'))

    qc.setQueryData(blobKeys.readUrl('brands/mark.svg'), 'https://storage.test/signed?token=two')
    await waitFor(() => expect(result.current).toContain('token=two'))
  })

  // Each key is its own query, so two marks on one page cannot be handed each
  // other's URL.
  it('keys the signed URL on the blob key', async () => {
    qc.setQueryData(blobKeys.readUrl('brands/a.svg'), 'https://storage.test/a')
    qc.setQueryData(blobKeys.readUrl('brands/b.svg'), 'https://storage.test/b')
    const { result } = renderHook(
      () => useAssetUrl(asset({ source: 'blob', blobKey: 'brands/b.svg' })),
      { wrapper },
    )
    await waitFor(() => expect(result.current).toBe('https://storage.test/b'))
  })
})
