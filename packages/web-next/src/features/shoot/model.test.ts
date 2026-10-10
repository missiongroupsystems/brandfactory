import { describe, expect, it } from 'vitest'

import { WEEKS } from '@/data/demo'
import { SHOOTS_BY_BRAND, type Shoot } from '@/data/shoots'

import { eventText, freeShootDay, moveStart, setEnd, withShoots } from './model'

const raffles = SHOOTS_BY_BRAND['casa-vostra'][0]!

describe('shoots on the calendar', () => {
  it('replaces the seed Shoot events with the shoots, each with its time and its sheet', () => {
    const weeks = withShoots(WEEKS, SHOOTS_BY_BRAND['casa-vostra'])
    const shootEvents = weeks.flatMap((w) => w.events.filter((e) => e.layer === 'shoot'))
    // One event per shoot: the seed's untimed "Shoot · Raffles City" is gone, not doubled.
    expect(shootEvents).toHaveLength(SHOOTS_BY_BRAND['casa-vostra'].length)
    expect(shootEvents[0]).toMatchObject({
      text: '12:00–17:00 · Raffles City',
      col: 3,
      span: 1,
      shootId: 'cv-shoot-raffles',
    })
    // City events and holidays stay as they were.
    expect(weeks[0]!.events.filter((e) => e.layer === 'city')).toHaveLength(2)
  })

  it('shows a shoot where it is now, once the call sheet moves it', () => {
    const moved: Shoot = { ...raffles, dayN: '30' }
    const weeks = withShoots(WEEKS, [moved])
    expect(weeks[0]!.events.some((e) => e.shootId)).toBe(false)
    expect(weeks[3]!.events.find((e) => e.shootId)).toMatchObject({ col: 5 })
  })

  it('reads as the team says it: hours, then the place', () => {
    expect(eventText(raffles)).toBe('12:00–17:00 · Raffles City')
  })
})

describe('a shoot’s hours', () => {
  it('keeps its length when the start moves', () => {
    expect(moveStart({ start: '12:00', end: '17:00' }, '14:00')).toEqual({
      start: '14:00',
      end: '19:00',
    })
  })

  it('never ends before it starts', () => {
    expect(setEnd({ start: '12:00' }, '11:00')).toEqual({ end: '13:00' })
    expect(setEnd({ start: '12:00' }, '15:30')).toEqual({ end: '15:30' })
  })
})

describe('the day a new shoot takes', () => {
  it('is the first day ahead with no shoot on it', () => {
    // Today is 6 Oct, and the 7th already has the Raffles City shoot.
    expect(freeShootDay(WEEKS, [raffles])).toBe('8')
    expect(freeShootDay(WEEKS, [])).toBe('7')
  })
})
