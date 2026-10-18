import { describe, expect, it } from 'vitest'

import type { ToolCall } from '../client'
import { cardsFor, changes, keeps } from './model'

let n = 0
const call = (tool: string, input: unknown, ok: boolean | null = true, extra = {}): ToolCall => ({
  id: `c${++n}`,
  tool,
  input,
  ok,
  ...extra,
})

describe('cardsFor', () => {
  it('makes one card per changed thing, in move order, and none for a read', () => {
    const cards = cardsFor({
      tools: [
        call('brand.state', { brand: 'b' }),
        call('idea.create', { brand: 'b', id: 'i1', hook: 'Dough', format: 'reel' }),
        call('post.list', { brand: 'b' }),
        call('post.create_draft', { brand: 'b', id: 'p1', hook: 'Dough', format: 'reel' }),
      ],
    })
    expect(cards.map((c) => [c.kind, c.id, c.verb])).toEqual([
      ['idea', 'i1', 'Added'],
      ['post', 'p1', 'Drafted'],
    ])
  })

  it('folds three edits of one idea into one card with the last verb and the merged input', () => {
    // The person reads one idea, not three copies; the card shows where the idea ended up.
    const cards = cardsFor({
      tools: [
        call('idea.create', { brand: 'b', id: 'i1', hook: 'Dough', format: 'reel' }),
        call('idea.edit', { brand: 'b', id: 'i1', hook: 'Dough, by hand' }),
        call('idea.place', { brand: 'b', id: 'i1', day: '2026-10-22' }),
      ],
    })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      verb: 'Moved',
      input: { hook: 'Dough, by hand', format: 'reel', day: '2026-10-22' },
    })
  })

  it('makes no card for a move that failed or has no result yet', () => {
    const cards = cardsFor({
      tools: [
        call('idea.create', { brand: 'b', id: 'i1' }, false),
        call('post.move', { brand: 'b', id: 'p1', day: '2026-10-22' }, null),
      ],
    })
    expect(cards).toEqual([])
  })

  it('draws a removed idea from the snapshot its call kept, faded', () => {
    const snapshot = { card: { id: 'i1', hook: 'Dough' } }
    const cards = cardsFor({
      tools: [call('idea.drop', { brand: 'b', id: 'i1' }, true, { snapshot })],
    })
    expect(cards[0]).toMatchObject({ kind: 'idea', verb: 'Removed', removed: true, snapshot })
  })

  it('keeps the first snapshot of a thing: a move then a removal still knows the start', () => {
    const start = { stage: 'draft' }
    const cards = cardsFor({
      tools: [
        call('post.mark', { brand: 'b', id: 'p1', stage: 'scheduled' }, true, { snapshot: start }),
        call('post.unplan', { brand: 'b', id: 'p1' }, true, { snapshot: { stage: 'scheduled' } }),
      ],
    })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ verb: 'Removed', removed: true, snapshot: start })
  })

  it('names the thing by the move’s own id field: a plan makes a post card, a shoot on a day a shoot card', () => {
    const cards = cardsFor({
      tools: [
        call('idea.plan', { brand: 'b', id: 'i1', postId: 'p9', day: '2026-10-22', time: '18:00' }),
        call('shoot.on_day', { brand: 'b', ideaId: 'i1', newShootId: 's3', day: '2026-10-21' }),
        call('share.link', { brand: 'b', kind: 'idea', id: 'i1' }),
        call('connection.set', { brand: 'b', key: 'tt', status: 'off' }),
      ],
    })
    expect(cards.map((c) => [c.kind, c.id, c.verb])).toEqual([
      ['post', 'p9', 'Planned'],
      ['shoot', 's3', 'Planned'],
      ['link', 'idea:i1', 'Link'],
      ['connection', 'tt', 'Disconnected'],
    ])
  })

  it('gives a changing move the cards do not draw a plain row, so nothing done is hidden', () => {
    const cards = cardsFor({ tools: [call('media.create', { brand: 'b', id: 'm1' })] })
    expect(cards[0]).toMatchObject({ kind: 'plain', tool: 'media.create' })
  })

  it('takes a call with no input, as an older saved chat has, without a card id', () => {
    const cards = cardsFor({ tools: [call('post.edit', undefined)] })
    expect(cards[0]).toMatchObject({ kind: 'post', id: '', input: {} })
  })
})

describe('changes and keeps', () => {
  it('reload the brand after a change, never after a read', () => {
    expect(changes('post.list')).toBe(false)
    expect(changes('brand.state')).toBe(false)
    expect(changes('post.move')).toBe(true)
  })
  it('keep the thing before a removal or a move, not before an edit', () => {
    expect(keeps('idea.drop')).toBe(true)
    expect(keeps('post.move')).toBe(true)
    expect(keeps('post.edit')).toBe(false)
  })
})
