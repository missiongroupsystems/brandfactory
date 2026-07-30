import { describe, expect, it } from 'vitest'
import { markdownToDraftBody } from './markdown'

// The converter is narrow on purpose — see the module comment. These tests are
// as much about what it *does not* emit as about what it does: everything here
// is parsed by TipTap's own schema on arrival, so a construct the editor has no
// node for is a construct that vanishes silently.

describe('markdownToDraftBody', () => {
  it('turns paragraphs into paragraphs, and keeps a plain-text twin', () => {
    const { html, text } = markdownToDraftBody('First line.\n\nSecond line.')
    expect(html).toBe('<p>First line.</p><p>Second line.</p>')
    expect(text).toBe('First line.\n\nSecond line.')
  })

  it('renders a bullet list as one list, not three', () => {
    const { html, text } = markdownToDraftBody('- one\n- two\n- three')
    expect(html).toBe('<ul><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li></ul>')
    expect(text).toBe('• one\n• two\n• three')
  })

  it('keeps bold, italic and links', () => {
    const { html } = markdownToDraftBody('**Warm**, *dry*, see [the about page](https://x.example)')
    expect(html).toContain('<strong>Warm</strong>')
    expect(html).toContain('<em>dry</em>')
    expect(html).toContain('<a href="https://x.example">the about page</a>')
  })

  // A citation that arrives as bare text has stopped being a citation — the
  // whole reason the staging channel carries HTML rather than plain text.
  it('strips the marks but keeps the words in the text twin', () => {
    const { text } = markdownToDraftBody('**Warm**, see [the about page](https://x.example)')
    expect(text).toBe('Warm, see the about page')
  })

  // The model is told not to write headings; if one arrives anyway it becomes a
  // paragraph rather than disappearing into a node the editor would drop.
  it('downgrades a heading to a paragraph', () => {
    expect(markdownToDraftBody('## Voice & tone\n\nWarm.').html).toBe(
      '<p>Voice &amp; tone</p><p>Warm.</p>',
    )
  })

  it('escapes HTML in the content, including in the text twin', () => {
    const { html, text } = markdownToDraftBody('Tagline: <script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(text).toContain('<script>')
    expect(text).not.toContain('&lt;')
  })

  // A model is the source of these strings, so a `javascript:` href is a real
  // shape to refuse — the same rule as every other externally-sourced URL here.
  it('does not linkify a non-http scheme', () => {
    const { html } = markdownToDraftBody('[click](javascript:alert(1))')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('javascript:alert(1)"')
  })

  it('drops blank lines rather than emitting empty paragraphs', () => {
    expect(markdownToDraftBody('\n\nOne.\n\n\n\nTwo.\n\n').html).toBe('<p>One.</p><p>Two.</p>')
  })
})
