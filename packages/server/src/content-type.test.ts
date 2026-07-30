import { describe, expect, it } from 'vitest'
import { contentTypeForKey, keyWithCanonicalExtension } from './content-type'

describe('contentTypeForKey', () => {
  it.each([
    ['uploads/2026/07/id-logo.svg', 'image/svg+xml'],
    ['uploads/2026/07/id-photo.JPG', 'image/jpeg'],
    ['uploads/2026/07/id-deck.pdf', 'application/pdf'],
  ])('%s → %s', (key, type) => {
    expect(contentTypeForKey(key)).toBe(type)
  })

  // The default cannot become a vector, so anything off the allowlist — the
  // Word types and `text/plain` included, deliberately — stays opaque.
  it.each(['uploads/2026/07/id-notes.txt', 'uploads/2026/07/id-doc.docx', 'uploads/2026/07/id'])(
    'leaves %s as octet-stream',
    (key) => {
      expect(contentTypeForKey(key)).toBe('application/octet-stream')
    },
  )
})

/**
 * The Stage 1–2 review's storage finding, in the half that is fixable from
 * here: `local-disk` answers "what type is this blob" from the key's extension
 * and Supabase answers it from the header the client PUT, `fly.toml` runs
 * Supabase, and every Stage 2 live pass ran on local-disk. The two inputs come
 * from different fields of the same request and were never compared.
 */
describe('keyWithCanonicalExtension', () => {
  it('leaves a key whose extension already agrees', () => {
    expect(keyWithCanonicalExtension('uploads/a/b-logo.png', 'image/png')).toBe(
      'uploads/a/b-logo.png',
    )
    // Both spellings of the same type count as agreement.
    expect(keyWithCanonicalExtension('uploads/a/b-photo.jpeg', 'image/jpeg')).toBe(
      'uploads/a/b-photo.jpeg',
    )
  })

  it('appends when the filename carried no usable extension', () => {
    expect(keyWithCanonicalExtension('uploads/a/b-logo', 'image/svg+xml')).toBe(
      'uploads/a/b-logo.svg',
    )
  })

  /**
   * The case the whole function exists for. Before this, `{ filename:
   * 'logo.svg', contentType: 'image/png' }` minted a key ending `.svg`, so
   * local-disk served `image/svg+xml` — a document — while Supabase served
   * `image/png`, for one set of bytes. Now both read png.
   */
  it('disarms a filename extension that disagrees with the authorised type', () => {
    const key = keyWithCanonicalExtension('uploads/a/b-logo.svg', 'image/png')
    expect(key).toBe('uploads/a/b-logo.svg.png')
    expect(contentTypeForKey(key)).toBe('image/png')
  })

  // A genuine SVG upload is untouched — the fix must not break the format 2D
  // went to the trouble of making work.
  it('leaves a real svg alone', () => {
    const key = keyWithCanonicalExtension('uploads/a/b-logo.svg', 'image/svg+xml')
    expect(key).toBe('uploads/a/b-logo.svg')
    expect(contentTypeForKey(key)).toBe('image/svg+xml')
  })

  // Types that never render inline are left as they are: local-disk says
  // octet-stream, Supabase says the declared type, and neither renders.
  it.each(['text/plain', 'application/msword'])('leaves %s keys unchanged', (type) => {
    expect(keyWithCanonicalExtension('uploads/a/b-notes.txt', type)).toBe('uploads/a/b-notes.txt')
  })
})
