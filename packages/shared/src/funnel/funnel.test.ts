import { describe, expect, it } from 'vitest'
import { DEFAULT_FUNNEL_STAGES, FUNNEL_STAGE_POSITION_STEP } from './defaults'
import {
  CreateFunnelActivityInputSchema,
  FunnelActivityStatusSchema,
  UpdateFunnelActivityInputSchema,
} from './funnel'

// The member list is duplicated with the pgEnum in `@brandfactory/db`, per the
// zod-⇄-pgEnum convention. This test is the pin: a member added to one side and
// not the other fails here, which is the only place that reads both as data.
describe('the status enum', () => {
  it('holds four states, and none of them measures anything', () => {
    // The request bounds this away from performance explicitly — *"not
    // performance; the deep platforms measure that."* A fifth member that scored
    // an activity would be a different feature.
    expect(FunnelActivityStatusSchema.options).toEqual(['planned', 'running', 'paused', 'done'])
  })
})

describe('the six defaults', () => {
  it('are the journey the request names, in order', () => {
    expect([...DEFAULT_FUNNEL_STAGES]).toEqual([
      'Awareness',
      'Interest',
      'Consideration',
      'Conversion',
      'Loyalty',
      'Advocacy',
    ])
  })

  it('leaves room to insert between two stages', () => {
    // Sparse ints, as `guideline_sections.priority` already is. A step of 1 would
    // force a renumber the first time somebody adds a stage in the middle.
    expect(FUNNEL_STAGE_POSITION_STEP).toBeGreaterThan(1)
  })
})

describe('an activity', () => {
  const base = { title: 'Spring campaign', status: 'planned' as const }

  it('needs only a title and a status', () => {
    // Everything else is optional: an activity is often planned before anybody
    // has decided where it runs or when.
    expect(CreateFunnelActivityInputSchema.safeParse(base).success).toBe(true)
  })

  it('takes two dates, and either alone', () => {
    // A Running activity has a start and no end — the state most activities are
    // in when anybody looks, and the one a single date could not express.
    expect(
      CreateFunnelActivityInputSchema.safeParse({ ...base, startsOn: '2026-03-01', endsOn: null })
        .success,
    ).toBe(true)
    expect(
      CreateFunnelActivityInputSchema.safeParse({ ...base, startsOn: null, endsOn: '2026-04-01' })
        .success,
    ).toBe(true)
  })

  it('refuses a status outside the four', () => {
    expect(
      CreateFunnelActivityInputSchema.safeParse({ ...base, status: 'crushing-it' }).success,
    ).toBe(false)
  })

  it('refuses an empty patch, which would be a write that changes nothing', () => {
    expect(UpdateFunnelActivityInputSchema.safeParse({}).success).toBe(false)
    expect(UpdateFunnelActivityInputSchema.safeParse({ status: 'done' }).success).toBe(true)
  })
})
