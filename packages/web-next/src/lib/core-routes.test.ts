import { describe, expect, it } from 'vitest'
import { coreCall, guestCall, isAccountRoute } from './core-routes'

describe('the routes on the core', () => {
  it('turns each ported route into its move, with the path and the body as the input', () => {
    expect(coreCall('GET', '/me', undefined)).toEqual({ op: 'account.me', input: {} })
    expect(
      coreCall('POST', '/brands', { org: 'demo', name: 'Lucali', handle: '@lucali', linked: [] }),
    ).toEqual({
      op: 'brand.create',
      input: { org: 'demo', name: 'Lucali', handle: '@lucali', linked: [] },
    })
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

  it('sends the idea routes to their moves', () => {
    expect(coreCall('POST', '/brands/casa/ideas/i1/plan', { postId: 'p1' })).toEqual({
      op: 'idea.plan',
      input: { brand: 'casa', id: 'i1', postId: 'p1' },
    })
    expect(coreCall('POST', '/brands/casa/ideas/i1/calendar', { why: 'x' })?.op).toBe(
      'idea.to_calendar',
    )
    expect(coreCall('DELETE', '/brands/casa/ideas/i1', undefined)?.op).toBe('idea.drop')
  })

  it('keeps the path’s ids over the body’s', () => {
    expect(coreCall('PATCH', '/brands/casa/ideas/i1', { brand: 'temper', id: 'x' })?.input).toEqual(
      { brand: 'casa', id: 'i1' },
    )
  })

  it('sends the shoot routes to their moves, a leave from the query and an invite after a yes', () => {
    expect(coreCall('DELETE', '/brands/casa/shoots/s1/ideas/i1?leave=1', undefined)).toEqual({
      op: 'shoot.remove_idea',
      input: { brand: 'casa', id: 's1', ideaId: 'i1', leave: true },
    })
    expect(coreCall('DELETE', '/brands/casa/shoots/s1/ideas/i1', undefined)?.input).toEqual({
      brand: 'casa',
      id: 's1',
      ideaId: 'i1',
    })
    expect(
      coreCall('POST', '/brands/casa/shoots/s1/crew', { id: 'c1', name: 'Marco', role: 'Chef' }),
    ).toEqual({
      op: 'shoot.add_crew',
      input: { brand: 'casa', id: 's1', crewId: 'c1', name: 'Marco', role: 'Chef' },
    })
    expect(coreCall('POST', '/brands/casa/shoots/on-day', { ideaId: 'i1' })?.op).toBe(
      'shoot.on_day',
    )
    expect(coreCall('POST', '/brands/casa/shoots/s1/invites', undefined)).toEqual({
      op: 'shoot.invite',
      input: { brand: 'casa', id: 's1' },
      approveFirst: true,
    })
  })

  it('sends the inbox, kit, connection and moodboard routes to their moves', () => {
    expect(coreCall('POST', '/brands/casa/inbox/clear-noise', undefined)?.op).toBe(
      'inbox.clear_noise',
    )
    expect(coreCall('POST', '/brands/casa/inbox/m1/reply', { text: 'Hi' })?.input).toEqual({
      brand: 'casa',
      id: 'm1',
      text: 'Hi',
    })
    expect(coreCall('PUT', '/brands/casa/kit/files/f1/version', { name: 'a.pdf' })?.op).toBe(
      'kit.file_version',
    )
    expect(coreCall('PUT', '/brands/casa/connections/lark', { status: 'off' })?.input).toEqual({
      brand: 'casa',
      key: 'lark',
      status: 'off',
    })
    expect(coreCall('POST', '/brands/casa/pasted', { id: 'p1' })?.op).toBe('pasted.add')
  })

  it('sends the share routes to their moves, and a guest page to guest moves with its token', () => {
    expect(coreCall('GET', '/brands/casa/share/idea/i1', undefined)).toEqual({
      op: 'share.link',
      input: { brand: 'casa', kind: 'idea', id: 'i1' },
    })
    expect(coreCall('PUT', '/brands/casa/comments/c1/done', { done: true })?.op).toBe(
      'comment.done',
    )
    expect(guestCall('GET', '/share/tok', undefined)).toEqual({
      op: 'guest.view',
      input: { token: 'tok' },
    })
    expect(
      guestCall('POST', '/share/tok/comments', { name: 'Ana', text: 'Hi', token: 'x' }),
    ).toEqual({
      op: 'guest.comment',
      input: { name: 'Ana', text: 'Hi', token: 'tok' },
    })
  })

  it('sends an upload to the move that makes its record, with the brand from the path', () => {
    expect(
      coreCall('POST', '/brands/casa/media', { id: 'm1', mime: 'image/png', bytes: 3, brand: 'x' }),
    ).toEqual({
      op: 'media.create',
      input: { id: 'm1', mime: 'image/png', bytes: 3, brand: 'casa' },
    })
  })

  it("sends the person's own picture to its two moves", () => {
    expect(coreCall('POST', '/me/avatar', { mime: 'image/jpeg', bytes: 9 })).toEqual({
      op: 'account.avatar_upload',
      input: { mime: 'image/jpeg', bytes: 9 },
    })
    expect(coreCall('PUT', '/me/avatar', { src: null })).toEqual({
      op: 'account.avatar_set',
      input: { src: null },
    })
  })

  it('has no move for a route the app does not call', () => {
    expect(coreCall('GET', '/brands/casa/posts/p1', undefined)).toBeNull()
  })
})

describe('the account routes', () => {
  it('sends Pinterest’s and TikTok’s routes to the server as they are, and no Meta route', () => {
    expect(isAccountRoute('POST', '/brands/b1/pinterest/connect')).toBe(true)
    expect(isAccountRoute('POST', '/pinterest/callback')).toBe(true)
    expect(isAccountRoute('GET', '/brands/b1/pinterest')).toBe(true)
    expect(isAccountRoute('GET', '/brands/b1/pinterest/pins')).toBe(true)
    expect(isAccountRoute('PUT', '/brands/b1/pinterest')).toBe(true)
    expect(isAccountRoute('DELETE', '/brands/b1/pinterest')).toBe(true)
    expect(isAccountRoute('POST', '/brands/b1/tiktok/connect')).toBe(true)
    expect(isAccountRoute('POST', '/tiktok/callback')).toBe(true)
    expect(isAccountRoute('DELETE', '/brands/b1/tiktok')).toBe(true)
    expect(isAccountRoute('PUT', '/brands/b1/make/instagram')).toBe(true)
    expect(isAccountRoute('DELETE', '/brands/b1/make/facebook')).toBe(true)
    expect(isAccountRoute('PUT', '/brands/b1/make/threads')).toBe(false)
    expect(isAccountRoute('POST', '/brands/b1/posts/p1/tiktok')).toBe(true)
    expect(isAccountRoute('GET', '/brands/b1/posts/p1/tiktok')).toBe(true)
    // Meta has no sign-in on the server yet.
    expect(isAccountRoute('POST', '/brands/b1/meta/connect')).toBe(false)
    expect(isAccountRoute('PUT', '/brands/b1/pinterest/pins')).toBe(false)
    expect(isAccountRoute('PUT', '/brands/b1/tiktok')).toBe(false)
  })
})
