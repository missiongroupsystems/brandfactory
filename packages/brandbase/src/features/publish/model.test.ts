import { describe, expect, it } from 'vitest'

import {
  activeChannels,
  blockers,
  initialDraft,
  linkedinText,
  primaryLabel,
  textFor,
  tiktokConsent,
  youtubeTitle,
  type Draft,
} from './model'

const CAPTION =
  'The final touch for a crispy crust 🔥 Find us at Raffles City. #casavostra #pizzasg #rafflescity'

function reel(over: Partial<Draft> = {}): Draft {
  return {
    ...initialDraft({
      format: 'reel',
      hook: 'The final touch. Watch the crust.',
      caption: CAPTION,
    }),
    ...over,
  }
}

describe('where a post can go', () => {
  it('starts on the four connected channels, Facebook left out until connected', () => {
    expect(activeChannels(reel()).map((c) => c.key)).toEqual(['ig', 'tt', 'yt', 'li'])
  })

  it('never sends a carousel to YouTube or a story beyond Instagram and Facebook', () => {
    const carousel = initialDraft({ format: 'carousel', hook: 'h', caption: 'c' })
    expect(activeChannels(carousel).map((c) => c.key)).toEqual(['ig', 'tt', 'li'])
    const story = initialDraft({
      format: 'story',
      hook: 'h',
      caption: '',
      connected: ['ig', 'tt', 'fb'],
    })
    expect(activeChannels(story).map((c) => c.key)).toEqual(['ig'])
  })
})

describe('TikTok asks every time', () => {
  it('blocks the button until somebody chooses who can watch', () => {
    // TikTok's Direct Post guidelines forbid a default; a preset answer would fail its audit.
    expect(blockers(reel())).toEqual(['Choose who can watch on TikTok.'])
    expect(blockers(reel({ privacy: 'Everyone' }))).toEqual([])
  })

  it('asks nothing when TikTok is not chosen', () => {
    expect(blockers(reel({ selected: ['ig', 'yt'] }))).toEqual([])
    expect(tiktokConsent(reel({ selected: ['ig'] }))).toBeNull()
  })

  it('starts with comments, Duet, Stitch and promotion off', () => {
    // TikTok's guidelines: the poster turns these on, the app never presets them.
    const draft = reel()
    expect(draft.interactions).toEqual({ comments: false, duet: false, stitch: false })
    expect(draft.promo).toEqual({ on: false, own: false, paid: false })
  })

  it('labels a post for your own brand as promotional content', () => {
    expect(tiktokConsent(reel({ promo: { on: true, own: true, paid: false } }))).toMatch(
      /Promotional content/,
    )
  })

  it('blocks a promotion switch that names no kind of promotion', () => {
    const promo = reel({ privacy: 'Everyone', promo: { on: true, own: false, paid: false } })
    expect(blockers(promo)).toEqual(['Say what it promotes on TikTok.'])
  })

  it('names the Branded Content Policy only for a paid partnership', () => {
    expect(tiktokConsent(reel())).not.toMatch(/Branded Content/)
    expect(tiktokConsent(reel({ promo: { on: true, own: false, paid: true } }))).toMatch(
      /Branded Content Policy/,
    )
  })
})

describe('one caption, fitted to each channel', () => {
  it('titles the Short from the caption until a title is typed, within 100 characters', () => {
    // The Short shows its title over the video, so a new caption must change it.
    expect(youtubeTitle(reel())).toBe('The final touch for a crispy crust')
    expect(youtubeTitle(reel({ caption: 'Ten seconds of fire 🔥 Blowtorch finish. #pizza' }))).toBe(
      'Ten seconds of fire',
    )
    expect(youtubeTitle(reel({ caption: '' }))).toBe('The final touch. Watch the crust.')
    expect(youtubeTitle(reel({ youtubeTitle: 'Typed by hand' }))).toBe('Typed by hand')
    expect(youtubeTitle(reel({ youtubeTitle: 'x'.repeat(140) }))).toHaveLength(100)
  })

  it('takes emoji out for LinkedIn and keeps one hashtag', () => {
    expect(linkedinText(CAPTION)).toBe(
      'The final touch for a crispy crust Find us at Raffles City. #casavostra',
    )
  })

  it('lets one channel be changed without touching the others', () => {
    const draft = reel({ overrides: { ig: 'Only on Instagram.' } })
    expect(textFor(draft, 'ig')).toEqual({ text: 'Only on Instagram.', adjusted: true })
    expect(textFor(draft, 'tt').text).toBe(CAPTION)
  })

  it('needs no caption for a story, which carries none', () => {
    const story = initialDraft({ format: 'story', hook: 'h', caption: '' })
    expect(blockers(story)).toEqual([])
    expect(blockers(reel({ caption: '  ', privacy: 'Everyone' }))).toEqual(['Write a caption.'])
  })
})

describe('the one button', () => {
  it('counts the channels and says whether it schedules or publishes', () => {
    expect(primaryLabel(reel())).toBe('Schedule on 4')
    expect(primaryLabel(reel({ when: 'now' }))).toBe('Publish to 4')
    expect(primaryLabel(reel({ selected: [] }))).toBe('Pick a channel')
  })
})
