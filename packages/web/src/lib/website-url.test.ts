import { describe, expect, it } from 'vitest'
import { displayHost, normalizeWebsiteUrl } from './website-url'

describe('normalizeWebsiteUrl', () => {
  it('adds https:// to a bare host', () => {
    expect(normalizeWebsiteUrl('casavostra.com')).toEqual({
      ok: true,
      value: 'https://casavostra.com',
    })
  })

  it('leaves an explicit scheme alone and trims', () => {
    expect(normalizeWebsiteUrl('  http://casavostra.com/menu  ')).toEqual({
      ok: true,
      value: 'http://casavostra.com/menu',
    })
  })

  // An empty field is how you say "this brand has no website", and how a brand
  // that never had one submits. It must not read as an error.
  it('treats an empty field as null, not as an error', () => {
    expect(normalizeWebsiteUrl('')).toEqual({ ok: true, value: null })
    expect(normalizeWebsiteUrl('   ')).toEqual({ ok: true, value: null })
  })

  // The one that matters. `z.url()` on its own accepts `javascript:alert(1)`
  // (it is a syntactically valid URL), and this value ends up in an `href` —
  // so the scheme filter is the check, not the URL parse.
  it('rejects a javascript: URL rather than prefixing it', () => {
    const result = normalizeWebsiteUrl('javascript:alert(1)')
    expect(result.ok).toBe(false)
    // The failure mode being guarded against is `https://javascript:alert(1)`:
    // a scheme the user supplied is never treated as a missing one.
    expect(normalizeWebsiteUrl('JavaScript:alert(1)').ok).toBe(false)
    expect(normalizeWebsiteUrl('data:text/html,<script>').ok).toBe(false)
    expect(normalizeWebsiteUrl('ftp://casavostra.com').ok).toBe(false)
  })

  it('rejects something that is not a web address at all', () => {
    expect(normalizeWebsiteUrl('not a url').ok).toBe(false)
  })
})

describe('displayHost', () => {
  it('drops the scheme, the www and a trailing slash', () => {
    expect(displayHost('https://www.casavostra.com/')).toBe('casavostra.com')
    expect(displayHost('https://casavostra.com/about/brand')).toBe('casavostra.com/about/brand')
  })

  // A link someone typed by hand is still worth rendering; swallowing it would
  // be a worse failure than an ugly one.
  it('falls back to the raw string when the URL does not parse', () => {
    expect(displayHost('casavostra')).toBe('casavostra')
  })
})
