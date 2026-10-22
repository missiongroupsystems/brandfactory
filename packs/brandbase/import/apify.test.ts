import { describe, expect, it } from 'vitest'
import { coverAddresses, fromInstagram, fromTikTok, hookOf, postsOf } from './apify'

// Items shaped as the actors' documented output (apify/instagram-post-scraper with detailed data,
// clockworks/tiktok-scraper on a profile), cut to the fields the import reads.
const reel = {
  inputUrl: 'https://www.instagram.com/chinmeechin.sg',
  id: '3706348645359165044',
  type: 'Video',
  productType: 'clips',
  shortCode: 'DN75KxVAREw',
  caption: '“I came to Chin Mee Chin when I was 10. I’m now 63.”\n\n#katong #kayatoast',
  url: 'https://www.instagram.com/p/DN75KxVAREw/',
  commentsCount: 41,
  likesCount: 1820,
  videoViewCount: 20311,
  videoPlayCount: 48210,
  videoDuration: 30.037,
  displayUrl: 'https://scontent.cdninstagram.com/v/reel-cover.jpg?oe=68B3745F',
  timestamp: '2026-10-03T04:00:37.000Z',
  ownerUsername: 'chinmeechin.sg',
}
const photo = {
  type: 'Image',
  shortCode: 'DGc0hweSykO',
  caption: 'NEW OPENING HOURS 🕙 We know you can’t get enough of our kaya buns.',
  url: 'https://www.instagram.com/p/DGc0hweSykO/',
  commentsCount: 12,
  likesCount: -1,
  displayUrl: 'https://scontent.cdninstagram.com/v/photo.jpg',
  timestamp: '2026-09-28T01:15:00.000Z',
  ownerUsername: 'chinmeechin.sg',
}
const video = {
  id: '7543693751290481942',
  text: 'Charcoal-grilled kaya buns, since 1925 #singapore',
  createTimeISO: '2026-10-01T09:30:00.000Z',
  authorMeta: { name: 'chinmeechin.sg' },
  webVideoUrl: 'https://www.tiktok.com/@chinmeechin.sg/video/7543693751290481942',
  videoMeta: {
    duration: 15,
    coverUrl: 'https://p16-sign-sg.tiktokcdn.com/cover.image?x-expires=1',
  },
  diggCount: 233,
  shareCount: 14,
  playCount: 5900,
  collectCount: 31,
  commentCount: 6,
  isSlideshow: false,
}

describe('an Instagram item', () => {
  it('is skipped when a creator made it, even with the brand as a coauthor: their voice, their reach', () => {
    const collab = {
      ...photo,
      ownerUsername: 'singapore.foodie',
      coauthorProducers: [{ username: 'chinmeechin.sg' }],
    }
    expect(fromInstagram(collab, 'chinmeechin.sg')).toBeNull()
  })

  it('becomes a posted reel with its first line as the hook, its plays as views and its length', () => {
    expect(fromInstagram(reel, 'chinmeechin.sg')).toEqual({
      channel: 'ig',
      externalId: 'DN75KxVAREw',
      format: 'reel',
      hook: '“I came to Chin Mee Chin when I was 10. I’m now 63.”',
      caption: reel.caption,
      at: '2026-10-03T04:00:37.000Z',
      permalink: 'https://www.instagram.com/p/DN75KxVAREw/',
      metrics: { likes: 1820, comments: 41, views: 48210 },
      cover: reel.displayUrl,
      duration: '0:30',
    })
  })

  it('leaves out likes a post hides, and has no views or length for a photo', () => {
    const post = fromInstagram(photo, 'chinmeechin.sg')
    expect(post?.format).toBe('carousel')
    expect(post?.metrics).toEqual({ comments: 12 })
    expect(post?.duration).toBeUndefined()
  })

  it('is a carousel with its first image when it is a sidecar, and takes view counts when plays are missing', () => {
    expect(fromInstagram({ ...photo, type: 'Sidecar' }, 'chinmeechin.sg')?.format).toBe('carousel')
    const { videoPlayCount: _, ...noPlays } = reel
    expect(fromInstagram(noPlays, 'chinmeechin.sg')?.metrics.views).toBe(20311)
  })

  it('cuts a long hook between emoji, never inside one', () => {
    const hook = hookOf(`Kaya${'🍞'.repeat(130)}`, 'x')
    expect(Array.from(hook)).toHaveLength(121)
    expect(hook).not.toMatch(/\uFFFD/)
    expect(hook.endsWith('🍞…')).toBe(true)
  })

  it('is skipped when it is an error, another account’s post, or has no cover or time', () => {
    expect(
      fromInstagram({ error: 'not_found', errorDescription: 'private' }, 'chinmeechin.sg'),
    ).toBeNull()
    expect(fromInstagram({ ...photo, ownerUsername: 'foodie.sg' }, 'chinmeechin.sg')).toBeNull()
    expect(
      fromInstagram(
        {
          ...photo,
          ownerUsername: 'foodie.sg',
          coauthorProducers: [{ username: 'nex.singapore' }],
        },
        'chinmeechin.sg',
      ),
    ).toBeNull()
    expect(fromInstagram({ ...photo, displayUrl: '' }, 'chinmeechin.sg')).toBeNull()
    expect(fromInstagram({ ...photo, timestamp: undefined }, 'chinmeechin.sg')).toBeNull()
  })
})

describe('a TikTok item', () => {
  it('becomes a posted reel with plays, shares and saves', () => {
    expect(fromTikTok(video, 'chinmeechin.sg')).toMatchObject({
      channel: 'tt',
      externalId: '7543693751290481942',
      format: 'reel',
      at: '2026-10-01T09:30:00.000Z',
      metrics: { likes: 233, comments: 6, views: 5900, shares: 14, saves: 31 },
      cover: video.videoMeta.coverUrl,
      duration: '0:15',
    })
  })

  it('is skipped when it has no cover', () => {
    expect(fromTikTok({ ...video, videoMeta: { duration: 15 } }, 'chinmeechin.sg')).toBeNull()
  })

  it('is a carousel when it is a slideshow, and skipped when another account made it', () => {
    expect(fromTikTok({ ...video, isSlideshow: true }, 'chinmeechin.sg')?.format).toBe('carousel')
    expect(fromTikTok({ ...video, authorMeta: { name: 'someone' } }, 'chinmeechin.sg')).toBeNull()
  })
})

describe('a scrape', () => {
  it('gives each post once, newest first', () => {
    const posts = postsOf([photo, reel, reel, { error: 'x' }], 'ig', 'chinmeechin.sg')
    expect(posts.map((p) => p.externalId)).toEqual(['DN75KxVAREw', 'DGc0hweSykO'])
  })
})

describe('a cover', () => {
  it('is tried on Instagram’s general host after its regional one, with the same path and signature', () => {
    const regional =
      'https://instagram.fosu2-2.fna.fbcdn.net/v/t51/806_n.jpg?stp=dst-jpg&oh=00_A&oe=6A'
    expect(coverAddresses(regional)).toEqual([
      regional,
      'https://scontent.cdninstagram.com/v/t51/806_n.jpg?stp=dst-jpg&oh=00_A&oe=6A',
    ])
  })

  it('has one address on any other host', () => {
    const tiktok = 'https://p16-sign-sg.tiktokcdn.com/cover.image?x-expires=1'
    expect(coverAddresses(tiktok)).toEqual([tiktok])
    expect(coverAddresses('https://scontent.cdninstagram.com/v/x.jpg')).toHaveLength(1)
  })
})

describe('a hook', () => {
  it('is the first line that has words, cut at a word', () => {
    expect(hookOf('\n\n  Kaya toast.\nMore', 'x')).toBe('Kaya toast.')
    expect(hookOf('', 'Instagram post')).toBe('Instagram post')
    const long = hookOf(`${'word '.repeat(40)}end`, 'x')
    expect(long.length).toBeLessThanOrEqual(121)
    expect(long.endsWith('word…')).toBe(true)
  })

  it('reads styled letters as plain ones and drops dashes at the ends, keeping the caption as it was', () => {
    expect(hookOf('𝐏𝐨𝐝𝐢𝐮𝐦 𝐏𝐢𝐜𝐤𝐬', 'x')).toBe('Podium Picks')
    expect(hookOf('Growing up is realising… Kaya™ ½ price', 'x')).toBe(
      'Growing up is realising… Kaya™ ½ price',
    )
    expect(hookOf('- 𝗖𝗲𝗹𝗲𝗯𝗿𝗮𝘁𝗶𝗻𝗴 𝗕𝗼𝗼𝗸𝘀𝗵𝗼𝗽 𝗗𝗮𝘆 -', 'x')).toBe('Celebrating Bookshop Day')
    const post = fromInstagram({ ...photo, caption: '𝐏𝐨𝐝𝐢𝐮𝐦 𝐏𝐢𝐜𝐤𝐬' }, 'chinmeechin.sg')
    expect(post?.caption).toBe('𝐏𝐨𝐝𝐢𝐮𝐦 𝐏𝐢𝐜𝐤𝐬')
  })

  it('skips a line with no words, and ends a cut with one ellipsis, not a stop and an ellipsis', () => {
    expect(hookOf('🔥🔥🔥\n---\nKaya toast at Katong', 'x')).toBe('Kaya toast at Katong')
    const cut = hookOf(`${'a'.repeat(70)} challenge. ${'b'.repeat(100)}`, 'x')
    expect(cut.endsWith('challenge…')).toBe(true)
  })
})
