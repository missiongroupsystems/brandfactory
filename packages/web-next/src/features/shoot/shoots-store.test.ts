import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { WEEKS } from '@/data/demo'

import {
  addCrew,
  leaveShoot,
  planShoot,
  resetShoots,
  sendInvites,
  shootIdeaOn,
  shootOfIdea,
  useInvited,
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
