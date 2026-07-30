import { describe, expect, it } from 'vitest'
import { researchReportMeta } from './research-copy'

// ---------------------------------------------------------------------------
// researchReportMeta — the report dialog's one line of provenance
// ---------------------------------------------------------------------------
//
// The first tested thing in this file, because it is the first thing in it that
// is a function rather than a sentence. Two properties carry weight: nothing is
// defaulted, and the date is UTC.

const BASE = {
  brandName: 'Casa Vostra',
  startedAt: '2026-07-30T09:00:00.000Z',
  sourceCount: 19,
  costUsd: 0.377,
}

describe('researchReportMeta', () => {
  it('states which brand, when, how well sourced and what it cost', () => {
    expect(researchReportMeta(BASE)).toBe('Casa Vostra · 30 Jul 2026 · 19 sources · $0.38')
  })

  // **UTC, matching `researchThreadName` on the server.** Local time would put a
  // run under one date here and another in the name of the conversation it
  // created, for anyone west of Greenwich in the evening.
  it('dates the run in UTC, not in the reader’s zone', () => {
    expect(researchReportMeta({ ...BASE, startedAt: '2026-07-30T23:40:00.000Z' })).toContain(
      '30 Jul 2026',
    )
  })

  // `startedAt`, so it agrees with the thread name — a run submitted at 23:58 and
  // reconciled at 00:04 is the research you asked for yesterday. Stated here
  // because the payload used to carry `completedAt` instead.
  it('is dated by the run’s own start, which is what the payload carries', () => {
    expect(researchReportMeta({ ...BASE, startedAt: '2026-07-29T23:58:00.000Z' })).toContain(
      '29 Jul 2026',
    )
  })

  // A bill and a trust signal. `$0.00` and `0 sources` are both statements this
  // repo has no business making about a run it does not have the numbers for.
  it('omits the cost rather than printing $0.00', () => {
    expect(researchReportMeta({ ...BASE, costUsd: null })).toBe(
      'Casa Vostra · 30 Jul 2026 · 19 sources',
    )
  })

  it('omits the source count rather than printing zero', () => {
    expect(researchReportMeta({ ...BASE, sourceCount: 0 })).toBe(
      'Casa Vostra · 30 Jul 2026 · $0.38',
    )
  })

  it('singularises one source', () => {
    expect(researchReportMeta({ ...BASE, sourceCount: 1 })).toContain('1 source ·')
  })

  it('omits an absent date, and an unparseable one', () => {
    expect(researchReportMeta({ ...BASE, startedAt: null })).toBe(
      'Casa Vostra · 19 sources · $0.38',
    )
    expect(researchReportMeta({ ...BASE, startedAt: 'not a date' })).toBe(
      'Casa Vostra · 19 sources · $0.38',
    )
  })

  // Everything else can be missing; the brand cannot. A meta line with no subject
  // is not a shorter line, it is a different bug.
  it('degrades to the brand name alone', () => {
    expect(
      researchReportMeta({
        brandName: 'Casa Vostra',
        startedAt: null,
        sourceCount: 0,
        costUsd: null,
      }),
    ).toBe('Casa Vostra')
  })
})
