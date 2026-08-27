import { describe, expect, it } from 'vitest'
import type { DeckVersion } from './deck'
import { byVersionRecency, currentVersion } from './ordering'

// The comparator reads two fields, so the fixture states two and casts past
// the branded ids and the source union — `byInfluencerReach`'s test keeps the
// same cast out of a sort test for the same reason.
function version(id: string, versionDate: string, createdAt: string): DeckVersion {
  return {
    id,
    versionDate,
    createdAt,
    deckId: 'd1',
    source: 'pdf',
    label: 'v',
    author: 'Somebody',
    pdfBlobKey: 'k',
    canvaUrl: null,
  } as unknown as DeckVersion
}

describe('byVersionRecency', () => {
  it('orders by the typed date, because that is what the reader recognises', () => {
    const older = version('a', '2026-01-01', '2026-01-01T00:00:00.000Z')
    const newer = version('b', '2026-06-01', '2026-01-02T00:00:00.000Z')
    expect([older, newer].sort(byVersionRecency).map((v) => v.id)).toEqual(['b', 'a'])
  })

  it('breaks a tie on created_at, so the last thing uploaded wins', () => {
    // Two versions, same version_date, different created_at.
    // Without the tie-break the "current" deck is whichever row the database
    // happened to return first — stable-looking, and wrong on a re-read.
    const uploadedFirst = version('a', '2026-03-01', '2026-03-01T09:00:00.000Z')
    const uploadedSecond = version('b', '2026-03-01', '2026-03-01T15:00:00.000Z')
    expect([uploadedFirst, uploadedSecond].sort(byVersionRecency).map((v) => v.id)).toEqual([
      'b',
      'a',
    ])
  })

  it('is total: no two distinct versions compare equal', () => {
    // created_at is monotonic and server-set, so this holds by construction.
    // The test is here so that a future edit cannot quietly drop the second key.
    const a = version('a', '2026-03-01', '2026-03-01T09:00:00.000Z')
    const b = version('b', '2026-03-01', '2026-03-01T09:00:00.001Z')
    expect(byVersionRecency(a, b)).not.toBe(0)
    expect(byVersionRecency(b, a)).not.toBe(0)
  })
})

describe('currentVersion', () => {
  it('answers null for an empty stack — a real state, not an error', () => {
    expect(currentVersion([])).toBeNull()
  })

  it('answers the most recent version, by the same rule byVersionRecency states', () => {
    const older = version('a', '2026-01-01', '2026-01-01T00:00:00.000Z')
    const newer = version('b', '2026-06-01', '2026-01-02T00:00:00.000Z')
    // Order of arrival must not matter.
    expect(currentVersion([older, newer])?.id).toBe('b')
    expect(currentVersion([newer, older])?.id).toBe('b')
  })

  it('does not mutate the array it is given', () => {
    const older = version('a', '2026-01-01', '2026-01-01T00:00:00.000Z')
    const newer = version('b', '2026-06-01', '2026-01-02T00:00:00.000Z')
    const list = [older, newer]
    currentVersion(list)
    expect(list.map((v) => v.id)).toEqual(['a', 'b'])
  })
})
