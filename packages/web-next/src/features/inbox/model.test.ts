import { describe, expect, it } from 'vitest'

import { INBOX_BY_BRAND, type InboxMessage } from '@/data/inbox'

import {
  ago,
  conversation,
  draftAt,
  firstNames,
  isNoise,
  nextAfter,
  queue,
  stamp,
  stamps,
} from './model'

const msg = (fields: Partial<InboxMessage> & Pick<InboxMessage, 'id'>): InboxMessage => ({
  platform: 'ig',
  kind: 'comment',
  from: { name: 'A Guest', handle: '@guest' },
  text: 'Lovely dinner',
  minutes: 10,
  tone: 'praise',
  drafts: ['Thank you!', 'So glad you came!'],
  ...fields,
})

describe('what needs a reply', () => {
  it('puts an older complaint above a newer question, so it reaches someone first', () => {
    const { open } = queue(
      [
        msg({ id: 'q', tone: 'question', minutes: 5 }),
        msg({ id: 'c', tone: 'complaint', minutes: 300 }),
        msg({ id: 'p', tone: 'praise', minutes: 1 }),
      ],
      new Set(),
    )
    expect(open.map((m) => m.id)).toEqual(['c', 'p', 'q'])
  })

  it('folds away an emoji-only comment even though it is praise', () => {
    const emoji = msg({ id: 'e', text: '😍😍😍' })
    expect(isNoise(emoji)).toBe(true)
    const { open, noise } = queue([emoji, msg({ id: 'real' })], new Set())
    expect(open.map((m) => m.id)).toEqual(['real'])
    expect(noise.map((m) => m.id)).toEqual(['e'])
  })

  it('keeps a short message with words, which a person still has to answer', () => {
    expect(isNoise(msg({ id: 'q', text: 'gf?', tone: 'question' }))).toBe(false)
  })

  it('lets a replied message leave the list', () => {
    const { open } = queue([msg({ id: 'a' }), msg({ id: 'b' })], new Set(['a']))
    expect(open.map((m) => m.id)).toEqual(['b'])
  })

  it('splits DMs from public comments and mentions', () => {
    const all = [
      msg({ id: 'c', kind: 'comment' }),
      msg({ id: 'm', kind: 'mention' }),
      msg({ id: 'd', kind: 'dm' }),
    ]
    expect(queue(all, new Set(), 'dms').open.map((m) => m.id)).toEqual(['d'])
    expect(queue(all, new Set(), 'comments').open.map((m) => m.id)).toEqual(['c', 'm'])
  })
})

describe('clearing the inbox', () => {
  const open = [msg({ id: 'a' }), msg({ id: 'b' }), msg({ id: 'c' })]

  it('opens the next message after a reply, so the user never stops to pick', () => {
    expect(nextAfter(open, 'a')).toBe('b')
  })

  it('opens the one above when the last message is replied to', () => {
    expect(nextAfter(open, 'c')).toBe('b')
    expect(nextAfter([open[0]!], 'a')).toBeNull()
  })

  it('goes round the drafts on Regenerate', () => {
    const m = msg({ id: 'a' })
    expect([0, 1, 2].map((n) => draftAt(m, n))).toEqual([
      'Thank you!',
      'So glad you came!',
      'Thank you!',
    ])
  })

  it('says how long ago a message came in, the way the apps do', () => {
    expect([25, 130, 1380].map(ago)).toEqual(['25m', '2h', '23h'])
    expect(ago(2 * 24 * 60)).toBe('2d')
  })
})

describe('the demo data', () => {
  it.each(Object.entries(INBOX_BY_BRAND))(
    '%s: every real message has a draft and every complaint names a real person',
    (_, inbox) => {
      for (const m of inbox.messages) {
        if (!isNoise(m)) expect(m.drafts.length).toBeGreaterThan(0)
        if (m.tone === 'complaint') {
          expect(inbox.people.map((p) => p.name)).toContain(m.sendTo)
        }
      }
      expect(queue(inbox.messages, new Set()).open[0]!.tone).toBe('complaint')
    },
  )
})

describe('who has a complaint', () => {
  it('reads as a sentence, however many people it went to', () => {
    expect(firstNames(['Giulia Conti'])).toBe('Giulia')
    expect(firstNames(['Marco Bellini', 'Giulia Conti'])).toBe('Marco and Giulia')
    expect(firstNames(['Marco Bellini', 'Giulia Conti', 'Daniel Lim'])).toBe(
      'Marco, Giulia and Daniel',
    )
  })
})

describe('a thread', () => {
  it('ends with the latest message, the one the reply answers', () => {
    const m = msg({
      id: 't',
      kind: 'dm',
      text: 'Is there a set menu?',
      minutes: 40,
      earlier: [
        { from: 'them', text: 'Table for 12 on Friday?', minutes: 57 },
        { from: 'us', text: 'Yes, Friday works.', minutes: 49 },
      ],
    })
    expect(conversation(m).map((e) => e.text)).toEqual([
      'Table for 12 on Friday?',
      'Yes, Friday works.',
      'Is there a set menu?',
    ])
    expect(conversation(m).at(-1)).toMatchObject({ from: 'them', minutes: 40 })
  })

  it('shows the time above the first message and after a gap, not on every bubble', () => {
    // Two days back, a reply soon after, then today: the reply needs no time of its own.
    const times = stamps([{ minutes: 2950 }, { minutes: 2925 }, { minutes: 132 }, { minutes: 130 }])
    expect(times).toEqual(['Friday 1:50 pm', null, 'Today 12:48 pm', null])
    expect(stamp(24 * 60)).toBe('Yesterday 3:00 pm')
    expect(stamp(8 * 24 * 60)).toBe('3 Oct 3:00 pm')
  })
})

describe('the demo threads', () => {
  it.each(Object.entries(INBOX_BY_BRAND))(
    '%s: a thread runs oldest first, and every note is signed by a real person',
    (_, inbox) => {
      for (const m of inbox.messages) {
        const ages = conversation(m).map((e) => e.minutes)
        expect(ages).toEqual([...ages].sort((a, b) => b - a))
        for (const e of m.earlier ?? []) {
          if (e.from === 'note') expect(inbox.people.map((p) => p.name)).toContain(e.by)
        }
      }
    },
  )
})
