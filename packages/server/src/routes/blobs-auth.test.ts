import type { BlobStore } from '@brandfactory/adapter-storage'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test-helpers'

const TOKEN = 't-blobs'
const USER_ID = 'u-blobs'

function makeHarness(storage?: Partial<BlobStore>) {
  const fakeStorage: BlobStore = {
    async put() {},
    async get() {
      return new Uint8Array()
    },
    async delete() {},
    async getSignedReadUrl() {
      return 'http://signed-read'
    },
    async getSignedWriteUrl(key) {
      return { url: `http://signed-write/${key}`, headers: { 'x-custom': 'yes' } }
    },
    ...storage,
  }
  return createTestApp({
    users: [{ id: USER_ID, token: TOKEN }],
    storage: fakeStorage,
  })
}

const AUTH = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }

describe('POST /blob-urls/upload-url', () => {
  it('returns 401 without auth', async () => {
    const { app } = makeHarness()
    const res = await app.request('/blob-urls/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'photo.jpg', contentType: 'image/jpeg', size: 1000 }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 for a disallowed content type', async () => {
    const { app } = makeHarness()
    const res = await app.request('/blob-urls/upload-url', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        filename: 'script.exe',
        contentType: 'application/x-msdownload',
        size: 1000,
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('INVALID_CONTENT_TYPE')
  })

  /**
   * **A `.woff2` could not be uploaded at all before the Typefaces section
   * existed** — the signed write URL was refused here, before any of the library
   * was reached. Four types, because a brand's typeface arrives as whichever one
   * the foundry supplied.
   */
  it.each(['font/woff2', 'font/woff', 'font/otf', 'font/ttf'])(
    'mints a write URL for %s',
    async (contentType) => {
      const { app } = makeHarness()
      const res = await app.request('/blob-urls/upload-url', {
        method: 'POST',
        headers: AUTH,
        body: JSON.stringify({ filename: 'satoshi.woff2', contentType, size: 40_000 }),
      })
      expect(res.status).toBe(200)
    },
  )

  // The allowlist is still an allowlist. `font/collection` is a real IANA type
  // and is not one of the four — a widened gate would have taken it too.
  it('still refuses a font type that is not on the list', async () => {
    const { app } = makeHarness()
    const res = await app.request('/blob-urls/upload-url', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ filename: 'all.ttc', contentType: 'font/collection', size: 40_000 }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 413 when size exceeds limit', async () => {
    const { app } = makeHarness()
    const maxBytes = 25 * 1024 * 1024
    const res = await app.request('/blob-urls/upload-url', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ filename: 'big.jpg', contentType: 'image/jpeg', size: maxBytes + 1 }),
    })
    expect(res.status).toBe(413)
  })

  it('returns a signed write URL with key and headers', async () => {
    const { app } = makeHarness()
    const res = await app.request('/blob-urls/upload-url', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ filename: 'photo.jpg', contentType: 'image/jpeg', size: 1000 }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { key: string; url: string; headers: Record<string, string> }
    expect(body.key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]+-photo\.jpg$/)
    expect(body.url).toContain('http://signed-write/')
    expect(body.headers?.['x-custom']).toBe('yes')
  })
})

describe('GET /blob-urls/:key/read-url', () => {
  it('returns 401 without auth', async () => {
    const { app } = makeHarness()
    const res = await app.request('/blob-urls/uploads/2024/04/uuid-photo.jpg/read-url')
    expect(res.status).toBe(401)
  })

  it('returns a signed read URL', async () => {
    const { app } = makeHarness()
    const res = await app.request('/blob-urls/uploads/2024/04/uuid-photo.jpg/read-url', {
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string }
    expect(body.url).toBe('http://signed-read')
  })
})
