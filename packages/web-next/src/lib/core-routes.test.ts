import { describe, expect, it } from 'vitest'
import { coreCall } from './core-routes'

describe('the routes on the core', () => {
  it('turns each ported route into its move, with the path and the body as the input', () => {
    expect(coreCall('GET', '/me', undefined)).toEqual({ op: 'account.me', input: {} })
    expect(coreCall('GET', '/brands/casa-vostra/state', undefined)).toEqual({
      op: 'brand.state',
      input: { brand: 'casa-vostra' },
    })
    expect(coreCall('POST', '/brands/casa/posts/p1/move', { day: '2026-10-10' })).toEqual({
      op: 'post.move',
      input: { brand: 'casa', id: 'p1', day: '2026-10-10' },
    })
    expect(coreCall('DELETE', '/brands/casa/posts/p1', undefined)).toEqual({
      op: 'post.unplan',
      input: { brand: 'casa', id: 'p1' },
    })
    expect(coreCall('POST', '/brands/casa/posts/p1/send', { when: 'slot' })?.op).toBe(
      'post.schedule',
    )
  })

  it('leaves a route not ported yet to the BrandBase API', () => {
    expect(coreCall('POST', '/brands/casa/ideas/i1/plan', {})).toBeNull()
    expect(coreCall('GET', '/brands/casa/posts/p1', undefined)).toBeNull()
  })
})
