import { describe, expect, it } from 'vitest'
import type { PostIdea, SocialPlatform, SocialPost } from '@brandfactory/shared'
import { IDEATE_MAX_TAKEN_SLOTS } from '@brandfactory/shared'
import type { KeyDate, KeyDateSet } from '@/lib/key-dates'
import {
  brainstormRequest,
  BRAINSTORM_IDEA_COUNT,
  chunkCopyPairs,
  commitPairs,
  inferCadence,
  inferPlatforms,
  initialSelections,
  keyDatesInWindow,
  monthPlanSummary,
  plannerBatchSize,
  plannerWindow,
  postsByDayPlatform,
  takenSlots,
  unclaimedKeyDates,
  type PlannerWindow,
} from './social-plan'

// Every `Date` here is built from local components, the `calendar.test.ts`
// convention: nothing pins `TZ`, and a literal UTC instant would make these
// assertions read differently in Auckland.
//
// **No assertion reads the current date.** `now` goes in as a fixture, and the
// month under test is August 2026 throughout — 31 days, and the month whose
// National Day the proposal quotes.

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

const AUG = { year: 2026, month: 7 } as const

/** Scheduled at a **local** wall-clock time, stated the way the wire states it. */
function post(id: string, local: Date | null, overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: id as SocialPost['id'],
    brandId: 'b-1' as SocialPost['brandId'],
    platform: 'instagram',
    scheduledAt: local === null ? null : local.toISOString(),
    body: `Copy for ${id}`,
    status: 'draft',
    createdBy: 'user',
    assetIds: [],
    deletedAt: null,
    ...STAMPS,
    ...overrides,
  }
}

function keyDate(id: string, start: string, end?: string, set: KeyDateSet = 'global'): KeyDate {
  return { id, set, name: id, start, ...(end ? { end } : {}), source: 'test' }
}

/** The clock every window assertion is read against — a Saturday in August. */
const NOW = new Date(2026, 7, 29, 12, 0)

function idea(title: string, platforms: SocialPlatform[]): PostIdea {
  return {
    title,
    angle: `Angle for ${title}`,
    pillar: null,
    date: '2026-08-11',
    platforms,
    keyDateName: null,
    reason: '',
  }
}

describe('postsByDayPlatform', () => {
  it('collects every platform a day already carries', () => {
    const taken = postsByDayPlatform([
      post('p-1', new Date(2026, 7, 3, 9, 0), { platform: 'instagram' }),
      post('p-2', new Date(2026, 7, 3, 17, 0), { platform: 'linkedin' }),
      post('p-3', new Date(2026, 7, 4, 9, 0), { platform: 'instagram' }),
    ])
    expect([...(taken.get('2026-08-03') ?? [])].sort()).toEqual(['instagram', 'linkedin'])
    expect([...(taken.get('2026-08-04') ?? [])]).toEqual(['instagram'])
  })

  it('collapses two posts on one day and one platform to a single entry', () => {
    // A launch day with two Instagram posts is one taken pair, not two — the
    // value is a set of platforms, never a count.
    const taken = postsByDayPlatform([
      post('p-1', new Date(2026, 7, 3, 9, 0)),
      post('p-2', new Date(2026, 7, 3, 13, 0)),
    ])
    expect(taken.get('2026-08-03')?.size).toBe(1)
  })

  it('ignores soft-deleted and unscheduled posts', () => {
    const taken = postsByDayPlatform([
      post('p-dead', new Date(2026, 7, 3, 9, 0), { deletedAt: '2026-07-02T00:00:00.000Z' }),
      post('p-tray', null),
    ])
    expect(taken.size).toBe(0)
  })

  it('keys a late-evening post by its local day, not by its UTC one', () => {
    // The invariant `calendar.ts` opens with, asserted here because this map is
    // what the planner's request body is built from.
    const taken = postsByDayPlatform([post('p-late', new Date(2026, 7, 3, 23, 30))])
    expect([...taken.keys()]).toEqual(['2026-08-03'])
  })
})

describe('unclaimedKeyDates', () => {
  const national = keyDate('National Day', '2026-08-09')
  const ghost = keyDate('Hungry Ghost month', '2026-08-01', '2026-08-30', 'sg-holidays')
  const september = keyDate('Teachers Day', '2026-09-04')

  it('drops a key date whose day already has a post', () => {
    const claimed = unclaimedKeyDates(
      [national],
      [post('p-1', new Date(2026, 7, 9, 9, 0))],
      AUG.year,
      AUG.month,
    )
    expect(claimed).toEqual([])
  })

  it('counts a key date claimed whatever platform the post targets', () => {
    // Looser than `postsByDayPlatform` on purpose: the question is whether the
    // date has been noticed at all.
    const claimed = unclaimedKeyDates(
      [national],
      [post('p-1', new Date(2026, 7, 9, 9, 0), { platform: 'linkedin' })],
      AUG.year,
      AUG.month,
    )
    expect(claimed).toEqual([])
  })

  it('never reports a season as unclaimed', () => {
    // A season has no one day to hang a post off — `SocialPostList`'s heading
    // suffixes exclude seasons for the same reason.
    expect(unclaimedKeyDates([ghost], [], AUG.year, AUG.month)).toEqual([])
  })

  it('ignores key dates outside the month', () => {
    expect(unclaimedKeyDates([september], [], AUG.year, AUG.month)).toEqual([])
  })

  it('does not let a soft-deleted post claim a date', () => {
    const unclaimed = unclaimedKeyDates(
      [national],
      [post('p-dead', new Date(2026, 7, 9, 9, 0), { deletedAt: '2026-07-02T00:00:00.000Z' })],
      AUG.year,
      AUG.month,
    )
    expect(unclaimed.map((d) => d.id)).toEqual(['National Day'])
  })

  it('returns the earliest first, whatever order the dataset arrived in', () => {
    const unclaimed = unclaimedKeyDates(
      [national, keyDate('Singles Day', '2026-08-02')],
      [],
      AUG.year,
      AUG.month,
    )
    expect(unclaimed.map((d) => d.start)).toEqual(['2026-08-02', '2026-08-09'])
  })
})

describe('monthPlanSummary', () => {
  const keyDates = [
    keyDate('National Day', '2026-08-09'),
    keyDate('Singles Day', '2026-08-02'),
    keyDate('Hungry Ghost month', '2026-08-01', '2026-08-30', 'sg-holidays'),
    keyDate('Teachers Day', '2026-09-04'),
  ]

  it('states the month, its posts and its unclaimed dates', () => {
    const summary = monthPlanSummary(
      [
        post('p-1', new Date(2026, 7, 2, 9, 0)),
        post('p-2', new Date(2026, 7, 20, 9, 0)),
        post('p-tray', null),
        post('p-sept', new Date(2026, 8, 1, 9, 0)),
      ],
      keyDates,
      AUG.year,
      AUG.month,
    )
    expect(summary.days).toBe(31)
    // The September post and the tray post are in no August slot.
    expect(summary.planned).toBe(2)
    // The season and the September date are not counted; Singles Day is claimed.
    expect(summary.keyDays).toBe(2)
    expect(summary.unclaimed.map((d) => d.name)).toEqual(['National Day'])
  })

  it('counts February 2028 as 29 days', () => {
    expect(monthPlanSummary([], [], 2028, 1).days).toBe(29)
  })

  it('reports no key days when every set is switched off', () => {
    const summary = monthPlanSummary(
      [post('p-1', new Date(2026, 7, 2, 9, 0))],
      [],
      AUG.year,
      AUG.month,
    )
    expect(summary.keyDays).toBe(0)
    expect(summary.unclaimed).toEqual([])
    expect(summary.planned).toBe(1)
  })
})

describe('inferCadence', () => {
  // Local noon on 29 August 2026, so the 28-day window opens on 2 August.
  const NOW = new Date(2026, 7, 29, 12, 0)

  /** `count` posts, one a day, ending the day before `NOW`. */
  function history(count: number): SocialPost[] {
    return Array.from({ length: count }, (_, i) => post(`p-${i}`, new Date(2026, 7, 28 - i, 9, 0)))
  }

  it('suggests three a week at nothing, one and two posts', () => {
    for (const count of [0, 1, 2]) {
      expect(inferCadence(history(count), NOW)).toEqual({ perWeek: 3, source: 'suggested' })
    }
  })

  it('measures from history at three posts', () => {
    // round(3 / 4) is 1, and the floor keeps it there rather than at zero.
    expect(inferCadence(history(3), NOW)).toEqual({ perWeek: 1, source: 'history' })
  })

  it('reads twelve posts in four weeks as three a week', () => {
    expect(inferCadence(history(12), NOW)).toEqual({ perWeek: 3, source: 'history' })
  })

  it('ignores posts older than the window and posts in the future', () => {
    const posts = [
      ...history(3),
      post('p-old', new Date(2026, 6, 1, 9, 0)),
      post('p-ahead', new Date(2026, 8, 15, 9, 0)),
    ]
    expect(inferCadence(posts, NOW)).toEqual({ perWeek: 1, source: 'history' })
  })

  it('includes today, and excludes the day the window opens minus one', () => {
    const onOpeningDay = post('p-open', new Date(2026, 7, 2, 9, 0))
    const dayBefore = post('p-before', new Date(2026, 7, 1, 9, 0))
    const today = post('p-today', new Date(2026, 7, 29, 20, 0))
    expect(inferCadence([onOpeningDay, dayBefore, today], NOW)).toEqual({
      // Two of the three are inside the window, which is under the floor.
      perWeek: 3,
      source: 'suggested',
    })
  })

  it('ignores soft-deleted posts', () => {
    const posts = history(3).map((p) => ({ ...p, deletedAt: '2026-08-20T00:00:00.000Z' }))
    expect(inferCadence(posts, NOW)).toEqual({ perWeek: 3, source: 'suggested' })
  })
})

describe('plannerBatchSize', () => {
  it('returns the floor of six for a single week at one a week', () => {
    expect(plannerBatchSize(1, 1)).toEqual({ slots: 1, count: 6 })
  })

  it('returns the ceiling of eighteen for five weeks at five a week', () => {
    expect(plannerBatchSize(5, 5)).toEqual({ slots: 25, count: 18 })
  })

  it('asks for half again as many ideas as slots in between', () => {
    expect(plannerBatchSize(4, 3)).toEqual({ slots: 12, count: 18 })
    expect(plannerBatchSize(2, 3)).toEqual({ slots: 6, count: 9 })
  })

  it('rounds a fractional slot count up — a part week is still a week to plan', () => {
    expect(plannerBatchSize(4.5, 3).slots).toBe(14)
  })
})

// ---------------------------------------------------------------------------
// The planner's request, and what the user accepted out of its answer
// ---------------------------------------------------------------------------

describe('plannerWindow', () => {
  it('plans the whole of a month the clock has not reached', () => {
    // The cursor is on September; today is in August.
    expect(plannerWindow('month', { year: 2026, month: 8 }, NOW)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
      weeks: 30 / 7,
    })
  })

  it('never starts a current month in the past', () => {
    // Proposing onto last Tuesday is a card the user can only reject.
    const window = plannerWindow('month', AUG, NOW)
    expect(window.start).toBe('2026-08-29')
    expect(window.end).toBe('2026-08-31')
    expect(window.weeks).toBeCloseTo(3 / 7)
  })

  it('plans a month already past exactly as it is', () => {
    const window = plannerWindow('month', { year: 2026, month: 6 }, NOW)
    expect(window.start).toBe('2026-07-01')
    expect(window.end).toBe('2026-07-31')
  })

  it('rolls four weeks forward from today, whatever the cursor says', () => {
    expect(plannerWindow('four-weeks', { year: 2027, month: 0 }, NOW)).toEqual({
      start: '2026-08-29',
      end: '2026-09-25',
      weeks: 4,
    })
  })
})

describe('keyDatesInWindow', () => {
  const window = { start: '2026-08-01', end: '2026-08-31', weeks: 31 / 7 }

  it('quotes a season it is standing in the middle of', () => {
    const ghost = keyDate('Hungry Ghost month', '2026-07-23', '2026-08-16', 'sg-holidays')
    const quoted = keyDatesInWindow([ghost], window)
    expect(quoted).toEqual([
      {
        name: 'Hungry Ghost month',
        start: '2026-07-23',
        end: '2026-08-16',
        // The set's **display name**: a gazetted holiday and a festival
        // organiser's announcement carry different planning weight, and
        // `sg-holidays` says that to nobody.
        set: 'Singapore holidays',
      },
    ])
  })

  it('drops what the window does not touch, and sorts what it does', () => {
    const july = keyDate('National Day', '2026-07-04')
    const nine = keyDate('National Day', '2026-08-09')
    const two = keyDate('Singles Day', '2026-08-02')
    expect(keyDatesInWindow([july, nine, two], window).map((d) => d.start)).toEqual([
      '2026-08-02',
      '2026-08-09',
    ])
  })
})

describe('takenSlots', () => {
  const august: PlannerWindow = { start: '2026-08-01', end: '2026-08-31', weeks: 31 / 7 }

  it('lists the pair, not the day', () => {
    const posts = [
      post('p-1', new Date(2026, 7, 3, 9, 0)),
      post('p-2', new Date(2026, 7, 3, 18, 0), { platform: 'linkedin' }),
    ]
    expect(takenSlots(posts, august)).toEqual([
      { day: '2026-08-03', platform: 'instagram' },
      { day: '2026-08-03', platform: 'linkedin' },
    ])
  })

  it('ignores what postsByDayPlatform ignores — one definition of taken', () => {
    const posts = [
      post('p-live', new Date(2026, 7, 3, 9, 0)),
      post('p-gone', new Date(2026, 7, 4, 9, 0), { deletedAt: '2026-08-01T00:00:00.000Z' }),
      post('p-tray', null),
    ]
    expect(takenSlots(posts, august)).toEqual([{ day: '2026-08-03', platform: 'instagram' }])
  })

  it('quotes only the window — a post outside it cannot collide', () => {
    const posts = [
      post('p-before', new Date(2026, 6, 30, 9, 0)),
      post('p-inside', new Date(2026, 7, 3, 9, 0)),
      post('p-after', new Date(2026, 8, 2, 9, 0)),
    ]
    expect(takenSlots(posts, august)).toEqual([{ day: '2026-08-03', platform: 'instagram' }])
  })

  it('keeps the window when history overruns the ceiling — the newest, not the oldest', () => {
    // The regression this filter exists for. `listSocialPostsByBrand` orders
    // `scheduledAt asc` and the map preserves it, so an unfiltered slice kept
    // the oldest IDEATE_MAX_TAKEN_SLOTS pairs and dropped every in-window one —
    // and the planner would then propose onto a day that already has a post.
    const posts = [
      // Well past the ceiling, all of it before the window.
      ...Array.from({ length: IDEATE_MAX_TAKEN_SLOTS + 50 }, (_, i) => {
        const d = new Date(2024, 0, 1)
        d.setDate(d.getDate() + i)
        d.setHours(9, 0)
        return post(`p-old-${i}`, d)
      }),
      post('p-inside', new Date(2026, 7, 12, 9, 0)),
    ]
    const slots = takenSlots(posts, august)
    expect(slots).toEqual([{ day: '2026-08-12', platform: 'instagram' }])
    expect(slots.length).toBeLessThanOrEqual(IDEATE_MAX_TAKEN_SLOTS)
  })
})

describe('inferPlatforms', () => {
  it('opens on what the brand posts to, most used first', () => {
    const posts = [
      post('p-1', new Date(2026, 7, 3, 9, 0), { platform: 'linkedin' }),
      post('p-2', new Date(2026, 7, 4, 9, 0), { platform: 'linkedin' }),
      post('p-3', new Date(2026, 7, 5, 9, 0), { platform: 'instagram' }),
    ]
    expect(inferPlatforms(posts)).toEqual(['linkedin', 'instagram'])
  })

  it('opens on one platform for a brand with no history', () => {
    // Never none: a picker that opens empty refuses to run on the one day the
    // planner is most needed.
    expect(inferPlatforms([])).toEqual(['instagram'])
    expect(inferPlatforms([post('p-1', null)])).toEqual(['instagram'])
  })
})

describe('commitPairs', () => {
  const ideas = [
    idea('Two platforms', ['instagram', 'linkedin']),
    idea('One platform', ['instagram']),
  ]

  it('counts chips, not cards', () => {
    expect(commitPairs(ideas, initialSelections(ideas))).toHaveLength(3)
  })

  it('writes nothing for a rejected card', () => {
    const selections = initialSelections(ideas)
    selections[0] = { ...selections[0]!, rejected: true }
    expect(commitPairs(ideas, selections).map((p) => p.idea.title)).toEqual(['One platform'])
  })

  it('writes nothing for a card whose last chip has gone', () => {
    const selections = initialSelections(ideas)
    selections[1] = { rejected: false, platforms: [] }
    expect(commitPairs(ideas, selections)).toHaveLength(2)
  })

  it('accepts every idea until one is rejected', () => {
    // Q6 sizes the batch at half again the slots so half can be thrown away —
    // a panel that opened with twelve cards all needing a click would make the
    // surplus a cost rather than a convenience.
    expect(initialSelections(ideas).every((s) => !s.rejected)).toBe(true)
  })
})

describe('chunkCopyPairs', () => {
  it('keeps a normal batch in one call', () => {
    expect(chunkCopyPairs(Array.from({ length: 12 }, (_, i) => i)).map((c) => c.length)).toEqual([
      12,
    ])
  })

  it('splits a batch the validator would refuse', () => {
    // Eighteen ideas naming two platforms each is thirty-six rows, and
    // `IdeateCopyInputSchema` caps one call at 24.
    const chunks = chunkCopyPairs(Array.from({ length: 36 }, (_, i) => i))
    expect(chunks.map((c) => c.length)).toEqual([24, 12])
    expect(chunks.flat()).toHaveLength(36)
  })
})

describe('brainstormRequest', () => {
  const KEY_DATES = [
    keyDate('National Day', '2026-08-09', undefined, 'sg-holidays'),
    keyDate('Hungry Ghost', '2026-08-08', '2026-09-06', 'sg-holidays'),
    keyDate('Teachers Day', '2026-09-04'),
  ]

  const req = (dayKey: string, platform: SocialPlatform = 'instagram') =>
    brainstormRequest({ dayKey, platform, keyDates: KEY_DATES, pillars: [] })

  it('plans a window exactly one day wide', () => {
    expect(req('2026-08-09').window).toEqual({ start: '2026-08-09', end: '2026-08-09' })
  })

  it('asks for three angles on the one platform it was given', () => {
    expect(req('2026-08-09', 'linkedin').count).toBe(BRAINSTORM_IDEA_COUNT)
    expect(req('2026-08-09', 'linkedin').platforms).toEqual(['linkedin'])
  })

  it('quotes the day and the season running through it, and nothing else', () => {
    // Overlap rather than containment: a festival that started the day before
    // is still the fact that shapes what may be posted today.
    expect(req('2026-08-09').keyDates.map((d) => d.name)).toEqual(['Hungry Ghost', 'National Day'])
  })

  it('sends no taken slots at all', () => {
    // The one place the planner's rule does not apply. The user is standing on
    // this day with this platform chosen; sending the list would have
    // `applyBoundaries` drop every idea the moment the slot already has a post,
    // and the panel would answer *no ideas* to its most direct question.
    // Nothing is double-booked by this, because nothing here writes.
    const taken = req('2026-08-09').taken
    expect(taken).toEqual([])
  })

  it('carries the written pillars through, and asks for proposals when there are none', () => {
    expect(
      brainstormRequest({
        dayKey: '2026-08-09',
        platform: 'instagram',
        keyDates: [],
        pillars: ['Behind the pass', 'Regulars'],
      }).pillars,
    ).toEqual(['Behind the pass', 'Regulars'])
    expect(req('2026-08-09').pillars).toEqual([])
  })

  it('states a cadence of one for a one-day window', () => {
    // The schema's floor, and the honest number: it sizes nothing here, because
    // `count` is fixed at three.
    expect(req('2026-08-09').cadencePerWeek).toBe(1)
  })
})
