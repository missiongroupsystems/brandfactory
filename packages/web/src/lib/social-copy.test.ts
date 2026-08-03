import { describe, expect, it } from 'vitest'
import type { SocialPost } from '@brandfactory/shared'
import { PLATFORM_LABELS, PLATFORM_OPTIONS, postExcerpt, STATUS_OPTIONS } from './social-copy'

describe('platform and status vocabulary', () => {
  it('capitalises the trademarks the way their owners do', () => {
    // `titleCase(platform)` would ship `Tiktok`, `Linkedin` and `Youtube`,
    // which read as typos on a marketing tool.
    expect(PLATFORM_LABELS.tiktok).toBe('TikTok')
    expect(PLATFORM_LABELS.linkedin).toBe('LinkedIn')
    expect(PLATFORM_LABELS.youtube).toBe('YouTube')
    expect(PLATFORM_LABELS.x).toBe('X')
  })

  it('derives the picker options from the labels, so the two cannot drift', () => {
    expect(PLATFORM_OPTIONS).toHaveLength(8)
    expect(PLATFORM_OPTIONS[0]).toEqual({ value: 'instagram', label: 'Instagram' })
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual(['draft', 'ready', 'posted'])
  })
})

describe('postExcerpt', () => {
  const of = (body: string, platform: SocialPost['platform'] = 'instagram') =>
    postExcerpt({ body, platform })

  it('falls back to the platform name for a claimed but empty slot', () => {
    expect(of('', 'linkedin')).toBe('LinkedIn')
    expect(of('   \n  ', 'x')).toBe('X')
  })

  it('collapses hard wraps so a chip stays one line', () => {
    expect(of('Sunday roast,\n  from three.')).toBe('Sunday roast, from three.')
  })

  it('leaves copy that already fits entirely alone', () => {
    expect(of('Short and done.')).toBe('Short and done.')
  })

  it('clips on a word boundary and marks the clip', () => {
    const excerpt = postExcerpt({ body: 'one two three four five six', platform: 'x' }, 20)
    expect(excerpt).toBe('one two three four…')
  })

  it('clips mid-word when the nearest break is too early to be worth taking', () => {
    // The break after "one" is at 27% of the limit; honouring it would throw
    // away most of the excerpt to avoid splitting a word.
    expect(postExcerpt({ body: 'one antidisestablishmentarian', platform: 'x' }, 12)).toBe(
      'one antidise…',
    )
  })

  it('clips mid-word rather than collapsing to an ellipsis alone', () => {
    // A single very long word has no late-enough break to use.
    expect(postExcerpt({ body: 'a'.repeat(40), platform: 'x' }, 10)).toBe(`${'a'.repeat(10)}…`)
  })
})
