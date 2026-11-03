import { createHmac } from 'node:crypto'
import { createCore } from '@brandfactory/core/src/app'
import { type CoreDeps } from '@brandfactory/core/src/run'
import { describe, expect, it } from 'vitest'
import { platformsFromEnv } from './env'
import { type MetaDelivery, metaWebhookRoutes } from './meta-webhooks'
import { accountRoutes, type Platforms } from './routes'

const SECRET = 'app-secret'
const TOKEN = 'verify-me'
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

/**
 * The core's HTTP door with the account routes, as the host mounts them. The webhook reads no
 * database, so the core has none.
 */
async function serve(platforms: Platforms, handle?: (d: MetaDelivery) => Promise<void>) {
  const core = {} as CoreDeps
  const app = createCore(core)
  if (handle) app.route('/', metaWebhookRoutes(platforms.metaHooks, handle))
  app.route('/', accountRoutes(core, platforms))
  return app
}

const verify = (query: Record<string, string>) =>
  `/webhooks/meta?${new URLSearchParams({ 'hub.mode': 'subscribe', ...query })}`

const COMMENT = JSON.stringify({
  object: 'instagram',
  entry: [{ id: '17841400000000001', time: 1762150000, changes: [{ field: 'comments' }] }],
})

describe('the Meta webhook', () => {
  it('answers the check Meta makes when the webhook is saved, with the verify token alone', async () => {
    const app = await serve(platformsFromEnv({ META_WEBHOOK_VERIFY_TOKEN: TOKEN }))
    const res = await app.request(
      verify({ 'hub.verify_token': TOKEN, 'hub.challenge': '1158201444' }),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('1158201444')
  })

  it('refuses the check with a wrong token, another mode, or a challenge that is not a plain word', async () => {
    const app = await serve({ metaHooks: { verifyToken: TOKEN } })
    const queries: Record<string, string>[] = [
      { 'hub.verify_token': 'wrong', 'hub.challenge': '1' },
      { 'hub.verify_token': TOKEN, 'hub.challenge': '1', 'hub.mode': 'unsubscribe' },
      { 'hub.verify_token': TOKEN, 'hub.challenge': '<script>' },
    ]
    for (const query of queries) {
      const res = await app.request(verify(query))
      expect(res.status).toBe(403)
      expect(await res.text()).not.toContain('<script>')
    }
  })

  it('takes a delivery signed with the app secret over its raw bytes, and hands it on', async () => {
    const got: MetaDelivery[] = []
    const app = metaWebhookRoutes({ verifyToken: TOKEN, appSecret: SECRET }, async (d) => {
      got.push(d)
    })
    // Meta escapes nothing for us: the signature is over the bytes as sent.
    const body = COMMENT.replace('comments', 'comments ✓')
    const res = await app.request('/webhooks/meta', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
      body,
    })
    expect(res.status).toBe(200)
    expect(got).toEqual([JSON.parse(body)])
  })

  it('refuses a delivery with no signature, a wrong one, or one made with another secret', async () => {
    const app = await serve({ metaHooks: { verifyToken: TOKEN, appSecret: SECRET } })
    for (const signature of [undefined, 'sha256=00', sign(COMMENT, 'other'), sign(`${COMMENT} `)]) {
      const res = await app.request('/webhooks/meta', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(signature && { 'x-hub-signature-256': signature }),
        },
        body: COMMENT,
      })
      expect(res.status).toBe(401)
    }
  })

  it('refuses every delivery while the app secret is not set, and keeps the server up', async () => {
    const app = await serve(platformsFromEnv({ META_WEBHOOK_VERIFY_TOKEN: TOKEN }))
    const res = await app.request('/webhooks/meta', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(COMMENT) },
      body: COMMENT,
    })
    expect(res.status).toBe(503)
  })

  it('refuses a signed body that is not a delivery', async () => {
    const app = await serve({ metaHooks: { verifyToken: TOKEN, appSecret: SECRET } })
    for (const body of ['not json', '[]', '{"object":"page","entry":[1]}']) {
      const res = await app.request('/webhooks/meta', {
        method: 'POST',
        headers: { 'x-hub-signature-256': sign(body) },
        body,
      })
      expect(res.status).toBe(400)
    }
  })

  it('refuses a body over 5 MB before reading it as a delivery', async () => {
    const app = await serve({ metaHooks: { verifyToken: TOKEN, appSecret: SECRET } })
    const body = 'x'.repeat(5 * 1024 * 1024 + 1)
    const res = await app.request('/webhooks/meta', {
      method: 'POST',
      headers: { 'x-hub-signature-256': sign(body) },
      body,
    })
    expect(res.status).toBe(413)
  })

  it('answers 500 when the delivery is not handled, so Meta sends it again', async () => {
    const app = await serve({ metaHooks: { verifyToken: TOKEN, appSecret: SECRET } }, async () => {
      throw new Error('database down')
    })
    const res = await app.request('/webhooks/meta', {
      method: 'POST',
      headers: { 'x-hub-signature-256': sign(COMMENT) },
      body: COMMENT,
    })
    expect(res.status).toBe(500)
  })

  it('is off with no verify token: the check and deliveries answer 503', async () => {
    const app = await serve(platformsFromEnv({ META_APP_SECRET: SECRET }))
    const check = await app.request(verify({ 'hub.verify_token': '', 'hub.challenge': '1' }))
    expect(check.status).toBe(503)
    const delivery = await app.request('/webhooks/meta', {
      method: 'POST',
      headers: { 'x-hub-signature-256': sign(COMMENT) },
      body: COMMENT,
    })
    expect(delivery.status).toBe(503)
  })
})
