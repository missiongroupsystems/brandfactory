import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WEEKS } from '@/data/demo'

import {
  addCrew,
  addShoot,
  leaveShoot,
  planShoot,
  REPLY_DELAY,
  resetShoots,
  sendInvites,
  shootIdeaOn,
  shootOfIdea,
  useInvited,
  useReplies,
  useShoots,
} from './shoots-store'

const BRAND = 'casa-vostra'
const shoots = () => renderHook(() => useShoots(BRAND)).result.current

beforeEach(() => resetShoots())

describe('planning a shoot', () => {
  it('takes the picked ideas out of the shoot they were in: an idea is shot once', () => {
    const id = planShoot(BRAND, WEEKS, ['cv-dough', 'cv-blindfold'])
    const now = shoots()
    expect(shootOfIdea(now, 'cv-dough')?.id).toBe(id)
    // Raffles City keeps its other idea and stays on the calendar.
    expect(now.find((s) => s.id === 'cv-shoot-raffles')?.ideaIds).toEqual(['cv-carb-up'])
    // The new shoot is at the brand's own room, with its usual crew, on a free day ahead.
    expect(now.find((s) => s.id === id)).toMatchObject({
      dayN: '8',
      start: '12:00',
      end: '17:00',
      place: 'Casa Vostra, Raffles City #01-23',
    })
  })

  it('joins the shoot already on a day picked on an idea page, else starts one there', () => {
    expect(shootIdeaOn(BRAND, WEEKS, 'cv-blindfold', '7', '16:00')).toBe('cv-shoot-raffles')
    // Joining does not retime a shoot others are in.
    expect(shoots().find((s) => s.id === 'cv-shoot-raffles')).toMatchObject({ start: '12:00' })
    const fresh = shootIdeaOn(BRAND, WEEKS, 'cv-blindfold', '15', '16:00')
    expect(shoots().find((s) => s.id === fresh)).toMatchObject({
      dayN: '15',
      start: '16:00',
      end: '21:00',
      ideaIds: ['cv-blindfold'],
    })
    expect(shootOfIdea(shoots(), 'cv-blindfold')?.id).toBe(fresh)
    leaveShoot(BRAND, 'cv-blindfold')
    expect(shootOfIdea(shoots(), 'cv-blindfold')).toBeUndefined()
  })

  it('drops a planned shoot its last idea leaves, but keeps a shoot from Lark', () => {
    // Moving the idea to another day must not leave an empty shoot on the old one.
    const first = shootIdeaOn(BRAND, WEEKS, 'cv-blindfold', '15', '16:00')
    shootIdeaOn(BRAND, WEEKS, 'cv-blindfold', '16', '16:00')
    expect(shoots().some((s) => s.id === first)).toBe(false)
    // A shoot booked in Lark is on the team's calendar whatever ideas it has.
    leaveShoot(BRAND, 'cv-carb-up')
    planShoot(BRAND, WEEKS, ['cv-dough'])
    expect(shoots().find((s) => s.id === 'cv-shoot-raffles')?.ideaIds).toEqual([])
  })
})

describe('the Lark invites', () => {
  it('go to the whole crew, and someone added later is not invited yet', () => {
    sendInvites(BRAND, 'cv-shoot-raffles')
    addCrew(BRAND, 'cv-shoot-raffles', { name: 'Ana Lee', role: 'Photographer' })
    const invited = renderHook(() => useInvited('cv-shoot-raffles')).result.current
    expect(invited).toEqual(['Nat Lim', 'Jules Tan', 'Chef Marco', 'Chef Dani'])
    expect(invited).not.toContain('Ana Lee')
  })
})

describe('a shoot added by hand', () => {
  it('stays on the calendar with no ideas, and an idea picked for its day joins it', () => {
    // Nat books shoots in Lark before any idea exists: an empty one must not vanish.
    const id = addShoot(BRAND, {
      title: 'Terrace',
      place: 'Casa Vostra terrace',
      dayN: '15',
      start: '14:00',
      end: '15:00',
    })
    expect(shoots().find((s) => s.id === id)).toMatchObject({ ideaIds: [], dayN: '15' })
    expect(shootIdeaOn(BRAND, WEEKS, 'cv-blindfold', '15', '12:00')).toBe(id)
    // Its hours are the ones typed in, not the idea's.
    expect(shoots().find((s) => s.id === id)).toMatchObject({
      start: '14:00',
      ideaIds: ['cv-blindfold'],
    })
    leaveShoot(BRAND, 'cv-blindfold')
    expect(shoots().some((s) => s.id === id)).toBe(true)
  })
})

describe('the answers to the invite', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const replies = () => renderHook(() => useReplies('cv-shoot-raffles')).result.current

  it("come in a moment after the invite: going, can't make it, or none yet", () => {
    sendInvites(BRAND, 'cv-shoot-raffles')
    // Nobody answers an invite the second it lands.
    expect(replies()).toEqual({})
    act(() => {
      vi.advanceTimersByTime(REPLY_DELAY)
    })
    expect(replies()).toEqual({ 'Nat Lim': 'going', 'Jules Tan': 'going', 'Chef Dani': 'cant' })
    // Chef Marco has not answered: the sheet shows him as no reply yet.
    expect(replies()['Chef Marco']).toBeUndefined()
  })

  it('never arrive for an invite a reset took back', () => {
    sendInvites(BRAND, 'cv-shoot-raffles')
    resetShoots()
    act(() => {
      vi.advanceTimersByTime(REPLY_DELAY)
    })
    expect(replies()).toEqual({})
  })
})
