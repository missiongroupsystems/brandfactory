import { describe, expect, it } from 'vitest'

import { dateOf, dayNOf, mediaItem, slotOf, srcOf } from './remote-days'

describe('the days at the server boundary', () => {
  it('reads a day below 5 as November, since the month runs 5 Oct to 1 Nov', () => {
    expect(dateOf('8')).toBe('2026-10-08')
    expect(dateOf('1')).toBe('2026-11-01')
    expect(dayNOf('2026-11-01')).toBe('1')
    expect(dayNOf('2026-10-31')).toBe('31')
  })

  it('gives no day for a date the demo cannot draw', () => {
    expect(dayNOf('2026-11-02')).toBeNull()
    expect(dayNOf('2026-10-04')).toBeNull()
    expect(dayNOf(null)).toBeNull()
  })

  it('prints the slot as the calendar does', () => {
    expect(slotOf('2026-10-08', '18:00')).toEqual({
      slot: 'Thu 8 Oct, 18:00',
      slotShort: 'Thu, 18:00',
    })
  })

  it('keeps a video a video both ways, and names an upload by its id', () => {
    expect(srcOf({ src: '/demo/reel.mp4', kind: 'video' })).toBe('/demo/reel.mp4#video')
    expect(srcOf({ src: '/demo/pasta.jpg', kind: 'photo' })).toBe('/demo/pasta.jpg')
    expect(mediaItem('https://api/media/m-1/sig#photo')).toEqual({
      src: 'https://api/media/m-1/sig#photo',
      kind: 'photo',
      mediaId: 'm-1',
    })
  })
})
