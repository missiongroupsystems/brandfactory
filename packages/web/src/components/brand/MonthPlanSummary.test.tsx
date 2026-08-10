import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SocialPost } from '@brandfactory/shared'
import type { KeyDate, KeyDateSet } from '@/lib/key-dates'
import { MonthPlanSummary } from './MonthPlanSummary'

const STAMPS = {
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
} as const

/** August 2026 — 31 days, and the month the proposal quotes. */
const AUG = { year: 2026, month: 7 } as const

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

function keyDate(name: string, start: string, end?: string, set: KeyDateSet = 'global'): KeyDate {
  return { id: name, set, name, start, ...(end ? { end } : {}), source: 'test' }
}

const national = keyDate('National Day', '2026-08-09')
const singles = keyDate('Singles Day', '2026-08-02')
const ghost = keyDate('Hungry Ghost month', '2026-08-01', '2026-08-30', 'sg-holidays')

/**
 * The whole sentence, as a reader hears it — one text content, not three
 * fragments. The middots are real text nodes, so a `gap` that replaced them
 * would fail here rather than reading as "31 days4 posts planned" to anything
 * taking the text.
 */
function sentence(): string {
  return screen.getByText(/days ·/).textContent ?? ''
}

describe('MonthPlanSummary', () => {
  it('names the first unclaimed key date and states the month', () => {
    render(
      <MonthPlanSummary
        posts={[post('p-1', new Date(2026, 7, 2, 9, 0)), post('p-2', new Date(2026, 7, 20, 9, 0))]}
        keyDates={[national, singles]}
        {...AUG}
      />,
    )
    expect(sentence()).toBe(
      'National Day (9 Aug) has no post. 31 days · 2 posts planned · 1 key date unclaimed.',
    )
  })

  it('names the earliest unclaimed date when there is more than one', () => {
    render(<MonthPlanSummary posts={[]} keyDates={[national, singles]} {...AUG} />)
    expect(sentence()).toBe(
      'Singles Day (2 Aug) has no post. 31 days · 0 posts planned · 2 key dates unclaimed.',
    )
  })

  it('drops the bold clause when every key date in the month is claimed', () => {
    render(
      <MonthPlanSummary
        posts={[post('p-1', new Date(2026, 7, 9, 9, 0))]}
        keyDates={[national]}
        {...AUG}
      />,
    )
    expect(sentence()).toBe('31 days · 1 post planned · no key dates unclaimed.')
    expect(screen.queryByText(/has no post/)).toBeNull()
  })

  it('never asks for a post on a season', () => {
    // The Hungry Ghost month covers the whole of August and nothing is planned,
    // yet there is no date to act on — only the tail renders.
    render(<MonthPlanSummary posts={[]} keyDates={[ghost]} {...AUG} />)
    expect(sentence()).toBe('31 days · 0 posts planned.')
  })

  it('drops the key-date clause entirely when every set is switched off', () => {
    render(<MonthPlanSummary posts={[post('p-1', new Date(2026, 7, 2, 9, 0))]} {...AUG} />)
    expect(sentence()).toBe('31 days · 1 post planned.')
  })

  it('counts only the posts inside the month', () => {
    render(
      <MonthPlanSummary
        posts={[
          post('p-aug', new Date(2026, 7, 31, 9, 0)),
          post('p-sept', new Date(2026, 8, 1, 9, 0)),
          post('p-tray', null),
          post('p-dead', new Date(2026, 7, 5, 9, 0), { deletedAt: '2026-07-02T00:00:00.000Z' }),
        ]}
        {...AUG}
      />,
    )
    expect(sentence()).toBe('31 days · 1 post planned.')
  })
})
