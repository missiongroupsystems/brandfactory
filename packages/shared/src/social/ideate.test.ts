import { describe, expect, it } from 'vitest'
import {
  DayKeySchema,
  IdeateCopyInputSchema,
  IdeateThemesInputSchema,
  IdeateThemesResultSchema,
  PostIdeaSchema,
  IDEATE_MAX_COPY_ITEMS,
  IDEATE_MAX_IDEAS,
} from '../index'

const IDEA = {
  title: 'The pass at 6pm',
  angle: 'Hands, steam, no faces. The forty minutes before the room fills.',
  pillar: 'Behind the pass',
  date: '2026-08-12',
  platforms: ['instagram'],
  keyDateName: null,
  reason: 'This brand sells the room, and the room is loudest before service.',
}

const THEMES_INPUT = {
  window: { start: '2026-08-01', end: '2026-08-31' },
  platforms: ['instagram', 'linkedin'],
  keyDates: [
    {
      name: 'National Day',
      start: '2026-08-09',
      set: 'Singapore holidays',
      note: 'Public holiday',
    },
  ],
  taken: [{ day: '2026-08-03', platform: 'instagram' }],
  cadencePerWeek: 3,
  pillars: ['Behind the pass'],
  count: 12,
}

describe('DayKeySchema', () => {
  it('takes a day key and refuses an ISO instant', () => {
    expect(DayKeySchema.safeParse('2026-08-09').success).toBe(true)
    // The invariant the whole feature rests on: a holiday has no time, and a
    // planning window has no timezone.
    expect(DayKeySchema.safeParse('2026-08-09T00:00:00.000Z').success).toBe(false)
    expect(DayKeySchema.safeParse('2026-8-9').success).toBe(false)
  })
})

describe('PostIdeaSchema', () => {
  it('accepts the documented shape', () => {
    expect(PostIdeaSchema.parse(IDEA).platforms).toEqual(['instagram'])
  })

  it('accepts a null date — the unscheduled tray is a real place', () => {
    expect(PostIdeaSchema.parse({ ...IDEA, date: null }).date).toBeNull()
  })

  it('rejects a date that is not a day key', () => {
    expect(PostIdeaSchema.safeParse({ ...IDEA, date: '12 August' }).success).toBe(false)
  })

  it('rejects a platform outside the enum', () => {
    expect(PostIdeaSchema.safeParse({ ...IDEA, platforms: ['threads'] }).success).toBe(false)
  })

  it('rejects an idea with no platform at all', () => {
    expect(PostIdeaSchema.safeParse({ ...IDEA, platforms: [] }).success).toBe(false)
  })

  it('accepts more than one platform — one idea, two destinations', () => {
    const parsed = PostIdeaSchema.parse({ ...IDEA, platforms: ['instagram', 'linkedin'] })
    expect(parsed.platforms).toEqual(['instagram', 'linkedin'])
  })
})

describe('IdeateThemesInputSchema', () => {
  it('accepts the documented shape', () => {
    const parsed = IdeateThemesInputSchema.parse(THEMES_INPUT)
    expect(parsed.keyDates[0]?.name).toBe('National Day')
    expect(parsed.taken[0]?.platform).toBe('instagram')
  })

  it('defaults the three optional lists, so a bare brief is a valid brief', () => {
    const parsed = IdeateThemesInputSchema.parse({
      window: { start: '2026-08-01', end: '2026-08-31' },
      platforms: ['instagram'],
      cadencePerWeek: 3,
      count: 6,
    })
    expect(parsed.keyDates).toEqual([])
    expect(parsed.taken).toEqual([])
    expect(parsed.pillars).toEqual([])
  })

  it('refuses a cadence of zero — a planner that proposes nothing is not a planner', () => {
    expect(IdeateThemesInputSchema.safeParse({ ...THEMES_INPUT, cadencePerWeek: 0 }).success).toBe(
      false,
    )
  })

  it('refuses a batch above the planner’s own ceiling', () => {
    expect(
      IdeateThemesInputSchema.safeParse({ ...THEMES_INPUT, count: IDEATE_MAX_IDEAS + 1 }).success,
    ).toBe(false)
  })

  it('refuses a run with no platform', () => {
    expect(IdeateThemesInputSchema.safeParse({ ...THEMES_INPUT, platforms: [] }).success).toBe(
      false,
    )
  })

  it('refuses a taken slot whose day is not a day key', () => {
    expect(
      IdeateThemesInputSchema.safeParse({
        ...THEMES_INPUT,
        taken: [{ day: 'tomorrow', platform: 'instagram' }],
      }).success,
    ).toBe(false)
  })
})

describe('IdeateCopyInputSchema', () => {
  const item = { idea: IDEA, platform: 'instagram' }

  it('accepts a batch of pairs', () => {
    expect(IdeateCopyInputSchema.parse({ items: [item, item] }).items).toHaveLength(2)
  })

  it('refuses an empty batch and a batch over the ceiling', () => {
    expect(IdeateCopyInputSchema.safeParse({ items: [] }).success).toBe(false)
    expect(
      IdeateCopyInputSchema.safeParse({
        items: Array.from({ length: IDEATE_MAX_COPY_ITEMS + 1 }, () => item),
      }).success,
    ).toBe(false)
  })
})

describe('IdeateThemesResultSchema', () => {
  it('carries the outcome vocabulary the client branches on', () => {
    for (const outcome of ['ok', 'no-ideas', 'invalid-shape'] as const) {
      expect(IdeateThemesResultSchema.safeParse({ ideas: [], pillars: [], outcome }).success).toBe(
        true,
      )
    }
    expect(
      IdeateThemesResultSchema.safeParse({ ideas: [], pillars: [], outcome: 'error' }).success,
    ).toBe(false)
  })

  it('marks a pillar as proposed or not — the whole point of the field', () => {
    const parsed = IdeateThemesResultSchema.parse({
      ideas: [IDEA],
      pillars: [{ name: 'Behind the pass', proposed: true }],
      outcome: 'ok',
    })
    expect(parsed.pillars[0]?.proposed).toBe(true)
  })
})
