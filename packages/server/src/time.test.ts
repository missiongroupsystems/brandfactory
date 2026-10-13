import { describe, expect, it } from 'vitest'
import { addDays, endOfWeek, instantOf, isDay, todayIn, weekdayOf } from './time'

describe('brand time', () => {
  it("reads today in the brand's zone, not the server's", () => {
    // 16:30 UTC on the 5th is already 00:30 on the 6th in Singapore.
    expect(todayIn('Asia/Singapore', new Date('2026-10-05T16:30:00Z'))).toBe('2026-10-06')
    expect(todayIn('UTC', new Date('2026-10-05T16:30:00Z'))).toBe('2026-10-05')
  })

  it('runs weeks Monday to Sunday', () => {
    expect(weekdayOf('2026-10-05')).toBe(0) // Monday
    expect(endOfWeek('2026-10-06')).toBe('2026-10-11')
    expect(endOfWeek('2026-10-11')).toBe('2026-10-11')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })

  it('puts a Singapore 18:00 post at 10:00 UTC, and a London one by its summer offset', () => {
    expect(instantOf('2026-10-08', '18:00', 'Asia/Singapore').toISOString()).toBe(
      '2026-10-08T10:00:00.000Z',
    )
    expect(instantOf('2026-07-01', '18:00', 'Europe/London').toISOString()).toBe(
      '2026-07-01T17:00:00.000Z',
    )
  })

  it('takes only real dates', () => {
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2026-10-06')).toBe(true)
    expect(isDay('6 Oct')).toBe(false)
  })
})
