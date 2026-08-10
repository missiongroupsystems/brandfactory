import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrandAsset, SocialPost } from '@brandfactory/shared'
import { downloadUrl, postDownloads } from './download'

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

function asset(id: string, over: Partial<BrandAsset> = {}): BrandAsset {
  return {
    id: id as BrandAsset['id'],
    brandId: 'b-1' as BrandAsset['brandId'],
    kind: 'image',
    library: 'photography',
    source: 'blob',
    role: null,
    status: 'active',
    label: 'An image',
    blobKey: `k-${id}`,
    position: 100,
    deletedAt: null,
    ...STAMPS,
    ...over,
  } as BrandAsset
}

function post(assetIds: string[]): SocialPost {
  return {
    id: 'p-1' as SocialPost['id'],
    brandId: 'b-1' as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: null,
    body: 'Copy',
    status: 'draft',
    createdBy: 'user',
    assetIds: assetIds as SocialPost['assetIds'],
    deletedAt: null,
    ...STAMPS,
  }
}

const resolve = (key: string) => `/blob/${key}`

describe('postDownloads', () => {
  it('prefers the uploaded filename, which is the one carrying the extension', () => {
    const kitchen = asset('a-1', { label: 'Primary', filename: 'kitchen.png' })
    expect(postDownloads(post(['a-1']), [kitchen], resolve)).toEqual([
      { url: '/blob/k-a-1', filename: 'kitchen.png' },
    ])
  })

  it('falls back to the label when nothing recorded a filename', () => {
    const kitchen = asset('a-1', { label: 'The kitchen' })
    expect(postDownloads(post(['a-1']), [kitchen], resolve)[0]?.filename).toBe('The kitchen')
  })

  it('keeps attachment order, which is the post’s display order', () => {
    const one = asset('a-1', { filename: 'one.png' })
    const two = asset('a-2', { filename: 'two.png' })
    const files = postDownloads(post(['a-2', 'a-1']), [one, two], resolve)
    expect(files.map((f) => f.filename)).toEqual(['two.png', 'one.png'])
  })

  it('skips a link asset — its bytes are on somebody else’s host', () => {
    const linked = asset('a-1', { source: 'link', url: 'https://drive.example/x' })
    expect(postDownloads(post(['a-1']), [linked], resolve)).toEqual([])
  })

  it('skips an id whose asset is gone, and one whose URL has not landed', () => {
    const kitchen = asset('a-1', { filename: 'kitchen.png' })
    // `a-gone` is soft-deleted and absent from the list; `a-2`'s signed URL has
    // not been minted yet, so `resolveBlob` answers with an empty string.
    const pending = asset('a-2', { filename: 'pending.png' })
    const files = postDownloads(post(['a-gone', 'a-1', 'a-2']), [kitchen, pending], (key) =>
      key === 'k-a-1' ? resolve(key) : '',
    )
    expect(files.map((f) => f.filename)).toEqual(['kitchen.png'])
  })

  it('returns nothing for a post with no attachments', () => {
    expect(postDownloads(post([]), [], resolve)).toEqual([])
  })
})

describe('downloadUrl', () => {
  const createObjectURL = vi.fn(() => 'blob:object-url')
  const revokeObjectURL = vi.fn()
  let clicked: HTMLAnchorElement[] = []

  beforeEach(() => {
    clicked = []
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function respondWith(body: Partial<Response>) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(body as Response))
  }

  it('fetches the bytes and clicks an anchor carrying the chosen name', async () => {
    respondWith({ ok: true, blob: async () => new Blob(['bytes']) })

    await downloadUrl('/blob/k-a-1', 'kitchen.png')

    expect(clicked).toHaveLength(1)
    // The whole reason for the fetch: `download` is ignored on a cross-origin
    // URL, and an object URL is same-origin by construction.
    expect(clicked[0]?.getAttribute('download')).toBe('kitchen.png')
    expect(clicked[0]?.getAttribute('href')).toBe('blob:object-url')
    // It does not stay in the document.
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('revokes the object URL after the click, not before it', async () => {
    respondWith({ ok: true, blob: async () => new Blob(['bytes']) })

    await downloadUrl('/blob/k-a-1', 'kitchen.png')

    // Deferred by one macrotask: the click queues the save rather than
    // completing it, and a synchronous revoke saves a zero-byte file in Safari.
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:object-url')
  })

  it('throws on a refused fetch rather than resolving quietly', async () => {
    respondWith({ ok: false, status: 403 })

    // The caller is downloading a named file and has to be able to say which
    // one did not arrive.
    await expect(downloadUrl('/blob/k-a-1', 'kitchen.png')).rejects.toThrow(/403/)
    expect(clicked).toHaveLength(0)
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
