import { describe, expect, it } from 'vitest'
import { testApp } from '../test-helpers'

describe('an upload', () => {
  it('gets a signed upload URL and a stable address that survives a reload', async () => {
    const { call, app } = await testApp()
    const res = await call('POST', '/brands/casa/media', {
      id: 'm1',
      mime: 'video/mp4',
      name: 'pasta.mp4',
      bytes: 1000,
      durationS: 32,
    })
    expect(res.status).toBe(201)
    expect(res.data.media).toMatchObject({
      kind: 'video',
      storageKey: 'casa/m1.mp4',
      durationS: 32,
    })
    expect(res.data.upload.url).toContain('casa/m1.mp4')
    const read = await app.request(new URL(res.data.src).pathname)
    expect(read.status).toBe(302)
    expect(read.headers.get('location')).toContain('casa/m1.mp4')
  })

  it("refuses another brand's file in a post", async () => {
    const { call } = await testApp()
    await call('POST', '/brands/temper/media', { id: 'm9', mime: 'image/jpeg', bytes: 10 }, 'admin')
    const res = await call('POST', '/brands/casa/posts', {
      id: 'p1',
      format: 'reel',
      hook: 'x',
      media: [{ src: 'https://api.test/media/m9/x', kind: 'photo', mediaId: 'm9' }],
    })
    expect(res.data.code).toBe('BAD_MEDIA')
  })

  it('refuses an address with a forged signature', async () => {
    const { app } = await testApp()
    const read = await app.request('/media/m1/forged')
    expect(read.status).toBe(404)
  })
})
