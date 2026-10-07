import { describe, expect, it } from 'vitest'

import { contentFor } from '@/data/brands'
import { feedsOf, type Day } from '@/data/demo'

import { ALL_STAGES, itemsOf } from './calendar-items'
import { storiesOf } from './stories'

const casa = contentFor('casa-vostra')
const byId = (id: string) => casa.posts.find((p) => p.id === id)
const dayN = (n: string) => casa.weeks.flatMap((w) => w.days).find((d) => d.n === n)!

describe('a day’s stories, one by one', () => {
  it('lists as many stories as the day holds, in time order, the same every time', () => {
    // Thu 8 Oct has three stories out.
    const items = itemsOf(dayN('8'), byId, ALL_STAGES)
    const stories = storiesOf('8', items, 'casa-vostra', casa.library, byId)
    expect(stories).toHaveLength(3)
    expect(stories.map((s) => s.time)).toEqual([...stories.map((s) => s.time)].sort())
    expect(stories.every((s) => s.stage === 'posted' && !s.postId)).toBe(true)
    expect(storiesOf('8', items, 'casa-vostra', casa.library, byId)).toEqual(stories)
  })

  it('adds a planned story as its own post, which its row opens', () => {
    const planned: Day = { n: '20', story: { kind: 'post', postId: 'pasta' } }
    const stories = storiesOf('20', itemsOf(planned, byId, ALL_STAGES), 'casa-vostra', [], byId)
    expect(stories).toEqual([
      expect.objectContaining({ postId: 'pasta', title: 'Pasta by hand in 30 seconds.' }),
    ])
  })

  it('follows the stage filter: hiding Posted hides the stories already out', () => {
    const items = itemsOf(dayN('8'), byId, { ...ALL_STAGES, posted: false })
    expect(storiesOf('8', items, 'casa-vostra', casa.library, byId)).toEqual([])
    expect(feedsOf(dayN('8')).length).toBeGreaterThan(0)
  })
})
