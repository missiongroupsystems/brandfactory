import { describe, expect, it } from 'vitest'
import { refreshConnection } from './connections'
import { connectTikTok, setup, TT_TOKEN, tiktokToken } from './test-helpers'

describe('refreshConnection', () => {
  it('TikTok: stores the new access token and the rotated refresh token', async () => {
    const ctx = await setup()
    await connectTikTok(ctx, 'casa-vostra', 'open-a')
    const [conn] = await ctx.store.list('casa-vostra')

    ctx.net.handlers[TT_TOKEN] = ({ body }) => {
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('rft.open-a')
      return tiktokToken('open-a', 'act.second', 'rft.second')
    }
    expect(await refreshConnection(ctx.store, ctx.providers, 'casa-vostra', conn!.id)).toBe(
      'refreshed',
    )
    const stored = await ctx.store.get('casa-vostra', conn!.id)
    expect(stored?.tokens.accessToken).toBe('act.second')
    // The old refresh token may be dead after rotation; keeping it would lose the account.
    expect(stored?.tokens.refreshToken).toBe('rft.second')
    expect(stored?.tokens.expiresAt).toBeGreaterThan(Date.now() + 23 * 3600 * 1000)
  })

  it('TikTok: a refused refresh token marks the connection needs_reauth', async () => {
    const ctx = await setup()
    await connectTikTok(ctx, 'casa-vostra', 'open-a')
    const [conn] = await ctx.store.list('casa-vostra')
    ctx.net.handlers[TT_TOKEN] = () => ({ error: 'invalid_grant', error_description: 'expired' })
    expect(await refreshConnection(ctx.store, ctx.providers, 'casa-vostra', conn!.id)).toBe(
      'needs_reauth',
    )
    expect((await ctx.store.list('casa-vostra'))[0]?.status).toBe('needs_reauth')
  })

  it('Pinterest: refreshes with the stored refresh token and keeps it when none is returned', async () => {
    const ctx = await setup({
      'POST https://api.pinterest.com/v5/oauth/token': ({ body }) => {
        expect(body.get('refresh_token')).toBe('pinr-1')
        return { access_token: 'pina-2', expires_in: 2592000, scope: 'pins:read' }
      },
    })
    const [conn] = await ctx.store.save('casa-vostra', [
      {
        platform: 'pinterest',
        externalAccountId: 'pin-1',
        externalUserId: 'pin-1',
        displayName: 'casavostra',
        igBusinessAccountId: null,
        scopes: ['pins:read'],
        tokens: {
          accessToken: 'pina-1',
          refreshToken: 'pinr-1',
          expiresAt: 0,
          refreshExpiresAt: null,
        },
        connectedBy: 'marketer-1',
      },
    ])
    await refreshConnection(ctx.store, ctx.providers, 'casa-vostra', conn!.id)
    const stored = await ctx.store.get('casa-vostra', conn!.id)
    expect(stored?.tokens).toMatchObject({ accessToken: 'pina-2', refreshToken: 'pinr-1' })
  })

  it('Meta: an invalid Page token (code 190) marks the connection needs_reauth', async () => {
    const ctx = await setup({
      'GET https://graph.facebook.com/v26.0/me': () =>
        Response.json({ error: { message: 'Session expired', code: 190 } }, { status: 400 }),
    })
    const [conn] = await ctx.store.save('casa-vostra', [
      {
        platform: 'meta',
        externalAccountId: 'page-1',
        externalUserId: 'fb-user-1',
        displayName: 'Casa Vostra',
        igBusinessAccountId: 'ig-1',
        scopes: [],
        tokens: {
          accessToken: 'page-token',
          refreshToken: null,
          expiresAt: null,
          refreshExpiresAt: null,
        },
        connectedBy: 'marketer-1',
      },
    ])
    expect(await refreshConnection(ctx.store, ctx.providers, 'casa-vostra', conn!.id)).toBe(
      'needs_reauth',
    )
  })
})
