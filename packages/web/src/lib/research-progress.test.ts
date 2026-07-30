import { describe, expect, it } from 'vitest'
import { RESEARCH_DURATION_MAX_MINUTES, RESEARCH_DURATION_MIN_MINUTES } from '@brandfactory/shared'
import { ceilingWarningMinutes, formatElapsed, researchProgress } from '@/lib/research-progress'

const T0 = Date.parse('2026-07-30T09:00:00.000Z')
const at = (minutes: number) => T0 + minutes * 60_000
const START = '2026-07-30T09:00:00.000Z'

describe('formatElapsed', () => {
  it('shows seconds alone for the first minute', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(42_000)).toBe('42s')
    expect(formatElapsed(59_999)).toBe('59s')
  })

  // Zero-padded so the clock does not change width every ten seconds, which on
  // a ticking row reads as the layout twitching once a second.
  it('pads seconds once minutes appear', () => {
    expect(formatElapsed(60_000)).toBe('1m 00s')
    expect(formatElapsed(4 * 60_000 + 12_000)).toBe('4m 12s')
    expect(formatElapsed(47 * 60_000 + 2_000)).toBe('47m 02s')
  })

  // Past an hour the run is beyond any configured ceiling and the seconds have
  // stopped being the point.
  it('drops to hours and minutes past an hour', () => {
    expect(formatElapsed(3_600_000)).toBe('1h 00m')
    expect(formatElapsed(3_600_000 + 3 * 60_000)).toBe('1h 03m')
  })

  it('never renders negative time', () => {
    expect(formatElapsed(-5_000)).toBe('0s')
  })
})

describe('researchProgress — the fraction', () => {
  // The floor is the *start* of the quoted window, not zero: a run that has been
  // going two minutes is not behind, and drawing it as 0% would say it was.
  it('is empty until the window opens and full when it closes', () => {
    expect(researchProgress(START, at(0), 60).fraction).toBe(0)
    expect(researchProgress(START, at(RESEARCH_DURATION_MIN_MINUTES), 60).fraction).toBe(0)
    expect(researchProgress(START, at(RESEARCH_DURATION_MAX_MINUTES), 60).fraction).toBe(1)
  })

  it('sits halfway at the middle of the window', () => {
    const middle = (RESEARCH_DURATION_MIN_MINUTES + RESEARCH_DURATION_MAX_MINUTES) / 2
    expect(researchProgress(START, at(middle), 60).fraction).toBeCloseTo(0.5, 5)
  })

  it('clamps rather than overflowing on a long run', () => {
    expect(researchProgress(START, at(90), 60).fraction).toBe(1)
  })
})

describe('researchProgress — the pace', () => {
  it('is normal inside the quoted window', () => {
    expect(researchProgress(START, at(0), 60).pace).toBe('normal')
    expect(researchProgress(START, at(4), 60).pace).toBe('normal')
    expect(researchProgress(START, at(RESEARCH_DURATION_MAX_MINUTES), 60).pace).toBe('normal')
  })

  it('turns over once past it', () => {
    expect(researchProgress(START, at(RESEARCH_DURATION_MAX_MINUTES + 1), 60).pace).toBe('over')
    expect(researchProgress(START, at(29), 60).pace).toBe('over')
  })

  it('turns to ceiling at half the configured maximum', () => {
    expect(researchProgress(START, at(30), 60).pace).toBe('ceiling')
    expect(researchProgress(START, at(47), 60).pace).toBe('ceiling')
  })

  // Without the floor in `ceilingWarningMinutes`, a short ceiling would put the
  // "about to close" state *before* the "taking longer than usual" one.
  it('never lets ceiling precede over on a short configured maximum', () => {
    expect(ceilingWarningMinutes(20)).toBe(RESEARCH_DURATION_MAX_MINUTES)
    expect(researchProgress(START, at(14), 20).pace).toBe('normal')
    expect(researchProgress(START, at(16), 20).pace).toBe('ceiling')
  })

  // The deployment never told us its ceiling — see the schema field. The clock
  // and the over-time line survive; only the sentence naming a number goes.
  it('never claims a ceiling it was not given', () => {
    const p = researchProgress(START, at(600), Number.POSITIVE_INFINITY)
    expect(p.pace).toBe('over')
    expect(p.fraction).toBe(1)
  })
})

describe('researchProgress — the remaining minutes', () => {
  it('counts down to the configured maximum', () => {
    expect(researchProgress(START, at(47), 60).minutesToCeiling).toBe(13)
    expect(researchProgress(START, at(59.5), 60).minutesToCeiling).toBe(1)
  })

  // Past the ceiling the server has already closed the run, but a client whose
  // poll is failing can still render this — and "closes in -4 minutes" is worse
  // than saying it is due now.
  it('floors at zero rather than going negative', () => {
    expect(researchProgress(START, at(75), 60).minutesToCeiling).toBe(0)
  })
})

describe('researchProgress — degenerate timestamps', () => {
  // The window between the row being inserted and `startedAt` coming back. The
  // row's copy already called this "just started"; treating it as an error and
  // rendering nothing would blank the one line that says a paid run is going.
  it('treats an absent start as a run that just began', () => {
    expect(researchProgress(null, at(5), 60)).toMatchObject({ elapsedMs: 0, pace: 'normal' })
  })

  it('treats an unparseable start the same way', () => {
    expect(researchProgress('not a date', at(5), 60).elapsedMs).toBe(0)
  })

  // Clock skew between server and browser. A negative elapsed would format as
  // `0s` anyway, but the fraction must not go under the floor.
  it('never reports negative elapsed time', () => {
    const p = researchProgress(START, at(-10), 60)
    expect(p.elapsedMs).toBe(0)
    expect(p.fraction).toBe(0)
  })
})
