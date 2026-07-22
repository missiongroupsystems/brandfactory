import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relative-time'

const NOW = new Date('2026-04-20T12:00:00.000Z')

describe('formatRelativeTime', () => {
  it('formats minutes and hours ago', () => {
    expect(formatRelativeTime('2026-04-20T11:30:00.000Z', NOW)).toMatch(/30 minutes ago/)
    expect(formatRelativeTime('2026-04-20T10:00:00.000Z', NOW)).toMatch(/2 hours ago/)
  })

  it('uses "yesterday" for the previous calendar day (numeric: auto)', () => {
    expect(formatRelativeTime('2026-04-19T12:00:00.000Z', NOW)).toBe('yesterday')
  })

  it('formats future timestamps', () => {
    expect(formatRelativeTime('2026-04-20T15:00:00.000Z', NOW)).toMatch(/in 3 hours/)
  })

  it('returns empty string for invalid input', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('')
  })
})
