import { describe, expect, it } from 'vitest'
import { hmacSha256 } from './crypto'
import { connectTikTok, setup } from './test-helpers'

const metaConnection = (pageId: string) => ({
  platform: 'meta' as const,
  externalAccountId: pageId,
  externalUserId: 'fb-user-1',
  displayName: pageId,
  igBusinessAccountId: null,
  scopes: [],
  tokens: { accessToken: 't', refreshToken: null, expiresAt: null, refreshExpiresAt: null },
  connectedBy: 'marketer-1',
})

function signedRequest(secret: string, payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${hmacSha256(secret, body).toString('base64url')}.${body}`
}

const post = (body: string) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ signed_request: body }),
})

describe('Meta data deletion', () => {
  it("deletes the user's connections in every brand and returns {url, confirmation_code}", async () => {
    const ctx = await setup()
    await ctx.store.save('casa-vostra', [metaConnection('page-1')])
    await ctx.store.save('temper', [metaConnection('page-2')])
    const signed = signedRequest('meta-secret', { algorithm: 'HMAC-SHA256', user_id: 'fb-user-1' })

    const res = await ctx.app.request('/webhooks/meta/data-deletion', post(signed))
    const body = (await res.json()) as { url: string; confirmation_code: string }
    expect(body.url).toBe(
      `http://localhost:3010/meta/deletion-status?code=${body.confirmation_code}`,
    )
    expect(await ctx.store.list('casa-vostra')).toEqual([])
    expect(await ctx.store.list('temper')).toEqual([])
  })

  it('ignores a request not signed with our app secret', async () => {
    const ctx = await setup()
    await ctx.store.save('casa-vostra', [metaConnection('page-1')])
    const forged = signedRequest('wrong-secret', { algorithm: 'HMAC-SHA256', user_id: 'fb-user-1' })
    const res = await ctx.app.request('/webhooks/meta/data-deletion', post(forged))
    expect(res.status).toBe(400)
    expect(await ctx.store.list('casa-vostra')).toHaveLength(1)
  })
})

describe('TikTok webhook', () => {
  const event = JSON.stringify({ event: 'authorization.removed', user_openid: 'open-a' })

  it('marks the account needs_reauth on a correctly signed authorization.removed', async () => {
    const ctx = await setup()
    await connectTikTok(ctx, 'casa-vostra', 'open-a')
    const t = Math.floor(Date.now() / 1000)
    const s = hmacSha256('tt-secret', `${t}.${event}`).toString('hex')
    const res = await ctx.app.request('/webhooks/tiktok', {
      method: 'POST',
      headers: { 'TikTok-Signature': `t=${t},s=${s}` },
      body: event,
    })
    expect(res.status).toBe(200)
    expect((await ctx.store.list('casa-vostra'))[0]?.status).toBe('needs_reauth')
  })

  it('refuses a bad signature and a replayed old one', async () => {
    const ctx = await setup()
    await connectTikTok(ctx, 'casa-vostra', 'open-a')
    const old = Math.floor(Date.now() / 1000) - 3600
    const oldSig = hmacSha256('tt-secret', `${old}.${event}`).toString('hex')
    for (const header of ['t=1,s=00', `t=${old},s=${oldSig}`]) {
      const res = await ctx.app.request('/webhooks/tiktok', {
        method: 'POST',
        headers: { 'TikTok-Signature': header },
        body: event,
      })
      expect(res.status).toBe(401)
    }
    expect((await ctx.store.list('casa-vostra'))[0]?.status).toBe('active')
  })
})
