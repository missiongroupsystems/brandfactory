import { describe, expect, it } from 'vitest'

import {
  activeChannels,
  blockers,
  collabHeader,
  cropOffset,
  cropScale,
  defaultCrop,
  frameRatio,
  handleOf,
  improveCaption,
  initialDraft,
  inviteNote,
  linkedChannels,
  linkedinText,
  nudge,
  parseTime,
  primaryLabel,
  shapeFix,
  textFor,
  tiktokConsent,
  tiktokSettings,
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
    expect(activeChannels(story).map((c) => c.key)).toEqual(['ig', 'fb'])
  })
})

describe("only the brand's own platforms", () => {
  // The restaurants post on Instagram, TikTok and Facebook. YouTube and LinkedIn must not show up,
  // not even as an account to connect, or the team is asked about platforms it does not use.
  const ours = (format: 'reel' | 'carousel', selected?: Draft['selected']) =>
    initialDraft({
      format,
      hook: 'h',
      caption: 'c',
      linked: ['ig', 'tt', 'fb'],
      connected: ['ig', 'tt', 'fb'],
      selected,
    })

  it('shows and sends to the linked platforms only', () => {
    expect(linkedChannels(ours('reel')).map((c) => c.key)).toEqual(['ig', 'tt', 'fb'])
    // A new post starts on every account the brand has, Facebook included.
    expect(activeChannels(ours('reel')).map((c) => c.key)).toEqual(['ig', 'tt', 'fb'])
    const everywhere = ours('reel', ['ig', 'tt', 'yt', 'li', 'fb'])
    expect(activeChannels(everywhere).map((c) => c.key)).toEqual(['ig', 'tt', 'fb'])
  })

  it('drops an unlinked platform a saved post still names', () => {
    // A reel saved with the old default (Instagram, TikTok, YouTube) opens on the two it can use.
    const draft = ours('reel', ['ig', 'tt', 'yt'])
    expect(draft.selected).toEqual(['ig', 'tt'])
    expect(activeChannels({ ...draft, selected: ['yt'] })).toEqual([])
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

describe('a photo in the wrong shape', () => {
  it('flags a photo too tall for a feed post and fixes it to 4:5', () => {
    expect(shapeFix(9 / 16, 'carousel')).toBe('4:5')
    expect(shapeFix(2 / 3, 'carousel')).toBe('4:5')
  })

  it('lets a post through from 4:5 to landscape 1.91:1, as Instagram shows them whole', () => {
    expect(shapeFix(4 / 5, 'carousel')).toBeNull()
    expect(shapeFix(1, 'carousel')).toBeNull()
    expect(shapeFix(1.91, 'carousel')).toBeNull()
    // A camera's 1081 × 1351 is a pixel off 4:5, not a wrong shape.
    expect(shapeFix(1081 / 1351, 'carousel')).toBeNull()
  })

  it('accepts the 16:9 preset on a post, so a landscape crop is never flagged', () => {
    // The marketer picks landscape in the crop: the rule must not then call it the wrong shape.
    expect(shapeFix(16 / 9, 'carousel')).toBeNull()
    expect(shapeFix(3 / 2, 'carousel')).toBeNull()
  })

  it('fixes a panorama on a post to landscape, not to a tall 4:5', () => {
    expect(shapeFix(3, 'carousel')).toBe('16:9')
  })

  it('wants 9:16 for a reel or a story, so a 4:5 or landscape photo is flagged', () => {
    expect(shapeFix(9 / 16, 'reel')).toBeNull()
    expect(shapeFix(1000 / 1777, 'story')).toBeNull()
    expect(shapeFix(4 / 5, 'reel')).toBe('9:16')
    expect(shapeFix(16 / 9, 'story')).toBe('9:16')
  })
})

describe('tags and collaborators', () => {
  it('spells a handle the way Instagram does, whatever was typed', () => {
    expect(handleOf('@Chef Antonio')).toBe('@chefantonio')
    expect(handleOf('casa.vostra_sg')).toBe('@casa.vostra_sg')
    expect(handleOf('  @ ')).toBe('')
  })

  it('names both accounts on a collaboration, as the post shows once accepted', () => {
    expect(collabHeader('@casavostrasg', [])).toBe('casavostrasg')
    expect(collabHeader('@casavostrasg', ['@chefantonio'])).toBe('casavostrasg and chefantonio')
    expect(collabHeader('@casavostrasg', ['@a', '@b'])).toBe('casavostrasg and 2 others')
  })

  it('says the invite is still to come on a scheduled post, and sent once it is live', () => {
    expect(inviteNote([], false)).toBeNull()
    expect(inviteNote(['@chefantonio'], false)).toBe(
      'The invite goes to @chefantonio when the post goes out.',
    )
    expect(inviteNote(['@a', '@b', '@c'], true)).toBe(
      'Invite sent to @a, @b and @c, waiting for them to accept.',
    )
  })
})

describe('the brand’s TikTok default', () => {
  it('starts a new post on the answers the brand saved, not the model’s own', () => {
    const saved = {
      privacy: 'Friends' as const,
      interactions: { comments: true, duet: true, stitch: true },
      promo: { on: true, own: true, paid: false },
    }
    const draft = initialDraft({ format: 'reel', hook: '', caption: '', tiktok: saved })
    expect(tiktokSettings(draft)).toEqual(saved)
  })

  it('takes only the TikTok answers from what was saved', () => {
    const saved = { ...tiktokSettings(reel()), sound: 'library', when: 'now' }
    const draft = initialDraft({ format: 'reel', hook: '', caption: '', tiktok: saved })
    expect(draft).not.toHaveProperty('sound')
    expect(draft.when).toBe('slot')
  })
})

describe('Improve keeps the marketer’s words', () => {
  const TAGS = ['#casavostra', '#pizzasg']

  it('fixes slips, capitals and spacing, and adds the brand’s hashtags', () => {
    expect(improveCaption('teh crust is ready ,come by tonite  i promise', TAGS)).toBe(
      'The crust is ready, come by tonight I promise. #casavostra #pizzasg',
    )
  })

  it('starts each sentence with a capital and leaves an emoji ending alone', () => {
    expect(improveCaption('fresh pasta. made this morning 🔥', TAGS)).toBe(
      'Fresh pasta. Made this morning 🔥 #casavostra #pizzasg',
    )
  })

  it('keeps the hashtags and handles already there, and adds only the missing ones', () => {
    expect(improveCaption('With @chefim tonight. #PizzaSG #rafflescity', TAGS)).toBe(
      'With @chefim tonight. #PizzaSG #rafflescity #casavostra',
    )
  })

  it('never touches a link, a handle or a hashtag used as a word', () => {
    // A booking link that breaks, or a handle "fixed" into another account, would go out live.
    expect(
      improveCaption('book at https://casavostra.sg/book?src=ig,dont miss @nat_im', TAGS),
    ).toBe('Book at https://casavostra.sg/book?src=ig,dont miss @nat_im #casavostra #pizzasg')
    expect(improveCaption('loving #sunset vibes at casavostra.sg/dont-miss', TAGS)).toBe(
      'Loving #sunset vibes at casavostra.sg/dont-miss #casavostra #pizzasg',
    )
  })

  it('changes nothing in a caption that is already clean', () => {
    const clean = 'Pasta by hand, every morning. #casavostra #pizzasg'
    expect(improveCaption(clean, TAGS)).toBe(clean)
  })
})

describe('a typed post time', () => {
  it('reads the ways people type a time, as the calendar stores it', () => {
    expect(parseTime('19:30')).toBe('19:30')
    expect(parseTime('1930')).toBe('19:30')
    expect(parseTime('930')).toBe('09:30')
    expect(parseTime('7.30pm')).toBe('19:30')
    expect(parseTime('7pm')).toBe('19:00')
    expect(parseTime('12am')).toBe('00:00')
    expect(parseTime('9')).toBe('09:00')
  })

  it('refuses what is not a time, so the field goes back to the time it had', () => {
    expect(parseTime('25:00')).toBeNull()
    expect(parseTime('19:75')).toBeNull()
    expect(parseTime('13pm')).toBeNull()
    expect(parseTime('soon')).toBeNull()
  })
})
