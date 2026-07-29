import { describe, expect, it, vi } from 'vitest'
import { IMAGE_URL_INVALID, IMAGE_URL_REFUSAL, probeImageUrl } from './image-url'

/**
 * A fake `Image` whose outcome the test drives. jsdom does not fetch image
 * `src`, so the real constructor would never settle — injecting the element is
 * what makes the probe testable at all, and it is why `createImage` exists.
 */
function fakeImage(outcome: 'load' | 'error' | 'never') {
  const img = { src: '', onload: null, onerror: null } as unknown as HTMLImageElement
  Object.defineProperty(img, 'src', {
    set() {
      if (outcome === 'never') return
      // Async, like the real thing: a handler assigned after `src` must still fire.
      queueMicrotask(() => {
        if (outcome === 'load') img.onload?.(new Event('load'))
        else img.onerror?.(new Event('error'))
      })
    },
    get() {
      return ''
    },
  })
  return img
}

describe('probeImageUrl — the scheme gate', () => {
  // Checked before the DOM is touched, with the same schema the server
  // enforces, so the two can never disagree about what a link may be.
  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'ftp://x.test/a.png',
    '/rel.png',
    '',
  ])('refuses %s without probing', async (url) => {
    const createImage = vi.fn(() => fakeImage('load'))
    const result = await probeImageUrl(url, { createImage })
    expect(result).toEqual({ ok: false, reason: 'invalid', message: IMAGE_URL_INVALID })
    expect(createImage).not.toHaveBeenCalled()
  })
})

describe('probeImageUrl — the load', () => {
  it('accepts a URL that loads', async () => {
    const result = await probeImageUrl('https://cdn.example.com/mark.svg', {
      createImage: () => fakeImage('load'),
    })
    expect(result).toEqual({ ok: true })
  })

  // The Drive/Dropbox case, which is the *expected* outcome of the link path
  // rather than its edge case: a share URL serves an HTML viewer page.
  it('refuses a URL that errors, with the copy that names the likely cause', async () => {
    const result = await probeImageUrl('https://drive.google.com/file/d/abc/view', {
      createImage: () => fakeImage('error'),
    })
    expect(result).toEqual({ ok: false, reason: 'unreachable', message: IMAGE_URL_REFUSAL })
  })

  // Not defensive. A host that blackholes the request fires neither event, and
  // without the timeout the form's save button stays disabled forever with no
  // explanation — which looks like a broken app rather than a bad URL.
  it('gives up on a host that never answers', async () => {
    vi.useFakeTimers()
    try {
      const promise = probeImageUrl('https://blackhole.test/a.png', {
        createImage: () => fakeImage('never'),
        timeoutMs: 100,
      })
      await vi.advanceTimersByTimeAsync(101)
      expect(await promise).toEqual({
        ok: false,
        reason: 'unreachable',
        message: IMAGE_URL_REFUSAL,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  // A slow response arriving after the timeout must not re-enter and flip a
  // settled verdict — the form would enable save on a URL it already refused.
  it('ignores a load that arrives after it has given up', async () => {
    vi.useFakeTimers()
    try {
      const img = fakeImage('never')
      const promise = probeImageUrl('https://slow.test/a.png', {
        createImage: () => img,
        timeoutMs: 100,
      })
      await vi.advanceTimersByTimeAsync(101)
      expect((await promise).ok).toBe(false)

      // The late `load` has nothing to call: the probe detached its handlers.
      expect(img.onload).toBeNull()
      expect(img.onerror).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the refusal copy', () => {
  /**
   * The assets proposal lists share-URL rewriting as a non-goal: turning a
   * Drive link into `?raw=1` is guessing at another product's URL scheme and it
   * breaks silently when they change it. The copy therefore *tells* and stops,
   * and this asserts it offers both real ways out rather than a magic fix.
   */
  it('offers a direct URL or an upload, and promises no rewrite', () => {
    expect(IMAGE_URL_REFUSAL).toMatch(/direct image URL/)
    expect(IMAGE_URL_REFUSAL).toMatch(/upload the file instead/)
    expect(IMAGE_URL_REFUSAL).not.toMatch(/raw=1|dl=1|we'?ll fix|automatically/i)
  })
})
