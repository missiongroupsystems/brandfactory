import { describe, expect, it } from 'vitest'

import { clockTime, clockToday } from './dates'

describe('clockTime', () => {
  it("reads the time in the brand's own timezone, on the 24-hour clock", () => {
    const at = new Date('2026-10-13T16:05:00Z')
    expect(clockTime('Asia/Singapore', at)).toBe('00:05')
    expect(clockTime('Europe/Rome', at)).toBe('18:05')
    // Midnight is 00:00, never 24:00, so times compare as text.
    expect(clockTime('Asia/Singapore', new Date('2026-10-13T16:00:00Z'))).toBe('00:00')
  })

  it("reads today's date in the brand's own timezone", () => {
    const at = new Date('2026-10-13T16:05:00Z')
    expect(clockToday(at, 'Asia/Singapore')).toBe('2026-10-14')
    expect(clockToday(at, 'Europe/Rome')).toBe('2026-10-13')
  })
})
