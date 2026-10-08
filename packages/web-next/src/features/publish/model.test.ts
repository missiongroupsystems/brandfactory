import { describe, expect, it } from 'vitest'

import {
  activeChannels,
  blockers,
  cropOffset,
  cropScale,
  defaultCrop,
  frameRatio,
  initialDraft,
  linkedinText,
  nudge,
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

describe('TikTok', () => {
  it('starts on Everyone, so a brand post is never stopped by the question', () => {
    // The brands post in public. Real posting must drop this default before TikTok's audit.
    expect(reel().privacy).toBe('Everyone')
    expect(blockers(reel())).toEqual([])
  })

  it('still blocks the button when nobody has said who can watch', () => {
    expect(blockers(reel({ privacy: null }))).toEqual(['Choose who can watch on TikTok.'])
  })

  it('asks nothing when TikTok is not chosen', () => {
    expect(blockers(reel({ selected: ['ig', 'yt'] }))).toEqual([])
    expect(tiktokConsent(reel({ selected: ['ig'] }))).toBeNull()
  })

  it('starts with comments on, and Duet, Stitch and promotion off', () => {
    // The owner wants comments on a brand post without a tap. TikTok's guidelines say the poster
    // turns every interaction on, so real posting must drop this default before the audit.
    const draft = reel()
    expect(draft.interactions).toEqual({ comments: true, duet: false, stitch: false })
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

describe('a photo in its frame', () => {
  // A 4:5 photo, the shape the brands shoot in.
  const portrait = defaultCrop(0.8)

  it('shows the whole photo until it is cut or zoomed', () => {
    expect(frameRatio(portrait)).toBe(0.8)
    expect(cropScale(portrait)).toEqual({ w: 1, h: 1 })
    expect(cropOffset(portrait)).toEqual({ tx: 0, ty: 0 })
  })

  it('cuts a portrait photo to a square by sliding it up or down, never sideways', () => {
    // The square is as wide as the photo, so the only room left is above and below.
    const square = { ...portrait, aspect: '1:1' as const }
    expect(cropScale(square)).toEqual({ w: 1, h: 1.25 })
    expect(nudge(square, 40, 40, 200, 200).x).toBe(0)
    expect(nudge(square, 0, -25, 200, 200).y).toBe(-1)
  })

  it('never drags the photo out of its frame', () => {
    // A wide frame on a tall photo leaves room above and below only; a long drag stops at the edge.
    const wide = { ...portrait, aspect: '16:9' as const }
    const dragged = nudge(wide, 0, 400, 200, 112.5)
    expect(dragged.y).toBe(1)
    expect(cropOffset(dragged).ty).toBeCloseTo(((cropScale(wide).h - 1) * 100) / 2)
  })
})

describe('one post, each platform its own limit', () => {
  it('blocks only the account whose text runs over its platform', () => {
    // LinkedIn takes 3,000 characters, Instagram 2,200: the same text can fit one and not the other.
    const long = 'a'.repeat(2500)
    const draft = reel({ caption: long, selected: ['ig', 'li'], privacy: 'Everyone' })
    expect(blockers(draft)).toEqual(['Shorten the text for Instagram (2500/2200).'])
    const fixed = reel({ ...draft, overrides: { ig: 'Short for Instagram.' } })
    expect(blockers(fixed)).toEqual([])
  })
})
