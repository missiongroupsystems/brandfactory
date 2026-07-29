import { createHmac } from 'node:crypto'
import { BlobNotFoundError, type BlobStore } from '@brandfactory/adapter-storage'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test-helpers'

function sign(method: 'GET' | 'PUT', key: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${method}\n${key}\n${exp}`).digest('hex')
}

function buildStorage(): { store: BlobStore; written: Map<string, Uint8Array> } {
  const written = new Map<string, Uint8Array>()
  const store: BlobStore = {
    async put(key, body) {
      const bytes =
        body instanceof Uint8Array
          ? body
          : new Uint8Array(await new Response(body as unknown as ReadableStream).arrayBuffer())
      written.set(key, bytes)
    },
    async get(key) {
      const bytes = written.get(key)
      if (!bytes) throw new BlobNotFoundError(key)
      return bytes
    },
    async delete(key) {
      written.delete(key)
    },
    async getSignedReadUrl() {
      return 'http://signed'
    },
    async getSignedWriteUrl() {
      return { url: 'http://signed' }
    },
  }
  return { store, written }
}

const SECRET = 'test-secret'

describe('blobs routes', () => {
  it('PUT with a valid signature writes the bytes', async () => {
    const { store, written } = buildStorage()
    const { app } = createTestApp({ storage: store })
    const key = 'nested/path/hello.txt'
    const exp = Math.floor(Date.now() / 1000) + 60
    const sig = sign('PUT', key, exp, SECRET)
    const res = await app.request(`/blobs/${key}?exp=${exp}&sig=${sig}`, {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3]),
    })
    expect(res.status).toBe(200)
    expect(written.get(key)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('GET with a valid signature streams the bytes back', async () => {
    const { store } = buildStorage()
    const { app } = createTestApp({ storage: store })
    const key = 'hello.txt'
    const expPut = Math.floor(Date.now() / 1000) + 60
    await app.request(`/blobs/${key}?exp=${expPut}&sig=${sign('PUT', key, expPut, SECRET)}`, {
      method: 'PUT',
      body: new Uint8Array([7, 8, 9]),
    })
    const exp = Math.floor(Date.now() / 1000) + 60
    const res = await app.request(`/blobs/${key}?exp=${exp}&sig=${sign('GET', key, exp, SECRET)}`)
    expect(res.status).toBe(200)
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(buf)).toEqual([7, 8, 9])
  })

  // ---------------------------------------------------------------------------
  // Content type — the gap Stage 2D surfaced
  // ---------------------------------------------------------------------------
  //
  // Phase 4 hardcoded `application/octet-stream` and deferred the real thing.
  // It stayed invisible because browsers content-sniff PNG/JPEG for an `<img>`
  // — but **SVG is never sniffed**, so an uploaded SVG logo fired `onError` and
  // fell back to the monogram, indistinguishable from having no logo at all.

  async function getBlob(key: string) {
    const { store } = buildStorage()
    const { app } = createTestApp({ storage: store })
    const expPut = Math.floor(Date.now() / 1000) + 60
    await app.request(`/blobs/${key}?exp=${expPut}&sig=${sign('PUT', key, expPut, SECRET)}`, {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3]),
    })
    const exp = Math.floor(Date.now() / 1000) + 60
    return app.request(`/blobs/${key}?exp=${exp}&sig=${sign('GET', key, exp, SECRET)}`)
  }

  it.each([
    ['uploads/2026/07/abc-mark.svg', 'image/svg+xml'],
    ['uploads/2026/07/abc-photo.PNG', 'image/png'],
    ['uploads/2026/07/abc-photo.jpeg', 'image/jpeg'],
    ['uploads/2026/07/abc-deck.pdf', 'application/pdf'],
  ])('GET %s declares %s', async (key, expected) => {
    const res = await getBlob(key)
    expect(res.headers.get('content-type')).toBe(expected)
  })

  // The default is the one that cannot become a vector. `text/plain` and the
  // Word types are deliberately *not* in the map — they are downloads, not
  // things a browser should render inline from user bytes.
  it.each(['notes.txt', 'letter.doc', 'archive.zip', 'noextension', 'trailing.'])(
    'GET %s stays application/octet-stream',
    async (key) => {
      const res = await getBlob(key)
      expect(res.headers.get('content-type')).toBe('application/octet-stream')
    },
  )

  /**
   * What makes declaring a real content type safe. `/blobs` is same-origin with
   * the app, and an SVG is a *document*: navigated to directly, a `<script>` in
   * user-uploaded bytes would run in the app's origin. The sandbox and the null
   * default-src neutralise it; `nosniff` closes the other direction.
   */
  it('serves user bytes with a sandbox CSP and nosniff', async () => {
    const res = await getBlob('uploads/2026/07/abc-mark.svg')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('expired signature → 403', async () => {
    const { store } = buildStorage()
    const { app } = createTestApp({ storage: store })
    const key = 'e.txt'
    // 30s in the past is well outside the 10s clock-skew tolerance window.
    const exp = Math.floor(Date.now() / 1000) - 30
    const sig = sign('GET', key, exp, SECRET)
    const res = await app.request(`/blobs/${key}?exp=${exp}&sig=${sig}`)
    expect(res.status).toBe(403)
  })

  it('tampered signature → 403', async () => {
    const { store } = buildStorage()
    const { app } = createTestApp({ storage: store })
    const key = 't.txt'
    const exp = Math.floor(Date.now() / 1000) + 60
    const sig = sign('GET', key, exp, 'different-secret')
    const res = await app.request(`/blobs/${key}?exp=${exp}&sig=${sig}`)
    expect(res.status).toBe(403)
  })

  it('missing sig params → 400', async () => {
    const { app } = createTestApp()
    const res = await app.request('/blobs/whatever.txt')
    expect(res.status).toBe(400)
  })

  it('PUT with content-length over BLOB_MAX_BYTES → 413', async () => {
    const { store, written } = buildStorage()
    const { app } = createTestApp({
      storage: store,
      env: { BLOB_MAX_BYTES: 4 },
    })
    const key = 'too-big.bin'
    const exp = Math.floor(Date.now() / 1000) + 60
    const sig = sign('PUT', key, exp, SECRET)
    const res = await app.request(`/blobs/${key}?exp=${exp}&sig=${sig}`, {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3, 4, 5]),
      headers: { 'content-length': '5' },
    })
    expect(res.status).toBe(413)
    expect(written.has(key)).toBe(false)
  })

  it('PUT with body over BLOB_MAX_BYTES (no content-length) → 413', async () => {
    // Belt + suspenders path: client lies about / omits content-length but the
    // body is still too big. The post-read check catches it.
    const { store, written } = buildStorage()
    const { app } = createTestApp({
      storage: store,
      env: { BLOB_MAX_BYTES: 4 },
    })
    const key = 'too-big-2.bin'
    const exp = Math.floor(Date.now() / 1000) + 60
    const sig = sign('PUT', key, exp, SECRET)
    const res = await app.request(`/blobs/${key}?exp=${exp}&sig=${sig}`, {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3, 4, 5]),
    })
    expect(res.status).toBe(413)
    expect(written.has(key)).toBe(false)
  })

  it('not mounted when STORAGE_PROVIDER=supabase', async () => {
    const { app } = createTestApp({
      env: {
        STORAGE_PROVIDER: 'supabase',
        SUPABASE_URL: 'https://s.test',
        SUPABASE_SERVICE_KEY: 'sk',
        SUPABASE_STORAGE_BUCKET: 'b',
      },
    })
    const exp = Math.floor(Date.now() / 1000) + 60
    const res = await app.request(`/blobs/x?exp=${exp}&sig=abc`)
    expect(res.status).toBe(404)
  })
})
