import { describe, expect, it } from 'vitest'

import { slotOf } from './dates'
import { mediaItem, srcOf } from './remote-days'

describe('the server boundary', () => {
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
