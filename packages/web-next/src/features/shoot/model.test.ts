import { describe, expect, it } from 'vitest'

import { WEEKS } from '@/data/demo'
import { OUTLETS, SHOOTS_BY_BRAND, type Shoot } from '@/data/shoots'

import {
  eventText,
  freeShootDay,
  moveStart,
  pastPlaces,
  replySummary,
  setEnd,
  withShoots,
} from './model'

const raffles = SHOOTS_BY_BRAND['casa-vostra'][0]!

describe('shoots on the calendar', () => {
  it('replaces the seed Shoot events with the shoots, each with its time and its sheet', () => {
    const weeks = withShoots(WEEKS, SHOOTS_BY_BRAND['casa-vostra'])
    const shootEvents = weeks.flatMap((w) => w.events.filter((e) => e.layer === 'shoot'))
    // One event per shoot: the seed's untimed "Shoot · Raffles City" is gone, not doubled.
    expect(shootEvents).toHaveLength(SHOOTS_BY_BRAND['casa-vostra'].length)
    expect(shootEvents[0]).toMatchObject({
      text: 'Shoot · Raffles City · 12:00',
      col: 3,
      span: 1,
      shootId: 'cv-shoot-raffles',
    })
    // City events and holidays stay as they were.
    expect(weeks[0]!.events.filter((e) => e.layer === 'city')).toHaveLength(2)
  })

  it('shows a shoot where it is now, once the call sheet moves it', () => {
    const moved: Shoot = { ...raffles, date: '2026-10-30' }
    const weeks = withShoots(WEEKS, [moved])
    expect(weeks[0]!.events.some((e) => e.shootId)).toBe(false)
    expect(weeks[3]!.events.find((e) => e.shootId)).toMatchObject({ col: 5 })
  })

  it('reads as the team says it: hours, then the place', () => {
    expect(eventText(raffles)).toBe('Shoot · Raffles City · 12:00')
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
    expect(freeShootDay(WEEKS, [raffles])).toBe('2026-10-08')
    expect(freeShootDay(WEEKS, [])).toBe('2026-10-07')
  })
})

describe('the addresses on offer', () => {
  it('lists every outlet first, then the places this month went to, then earlier ones', () => {
    const shoots = SHOOTS_BY_BRAND['casa-vostra']
    const places = pastPlaces(OUTLETS['casa-vostra'], shoots, ['Raffles City, atrium (level 1)'])
    expect(places.map((p) => p.place)).toEqual([
      ...OUTLETS['casa-vostra'],
      'Raffles City, atrium (level 1)',
    ])
    // An outlet is one whether or not a shoot went there; an earlier place counts no shoot.
    expect(places.map((p) => p.outlet)).toEqual([true, true, true, false])
    expect(places[0]!.shoots).toBe(shoots.length)
    expect(places[1]!.shoots).toBe(0)
  })
})

describe('the answers to the invite', () => {
  it('counts each answer in one line, leaving out what nobody said', () => {
    const invited = ['Nat Lim', 'Jules Tan', 'Chef Marco', 'Chef Dani']
    const replies = { 'Nat Lim': 'going', 'Jules Tan': 'going', 'Chef Dani': 'cant' } as const
    expect(replySummary(invited, replies)).toBe("2 going · 1 can't make it · 1 no reply")
    expect(replySummary(invited, {})).toBe('4 no reply')
    // An answer from someone not invited (removed from the crew) does not count.
    expect(replySummary(['Nat Lim'], { 'Nat Lim': 'going', 'Lena Koh': 'cant' })).toBe('1 going')
  })
})
