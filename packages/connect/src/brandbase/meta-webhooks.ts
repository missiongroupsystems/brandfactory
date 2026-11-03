import { createHmac, timingSafeEqual } from 'node:crypto'
import { Refused } from '@brandfactory/core/src/errors'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { sameKey } from './readings'

/**
 * Meta's webhooks for the brands' Facebook Pages and Instagram accounts
 * (docs/executing/meta-direct-plan.md): the app's settings name `/webhooks/meta` with a verify
 * token, and Meta posts each change there, signed with the app secret.
 */
export interface MetaHooks {
  /**
   * `META_APP_SECRET`: Meta signs each body with it. Until it is set, the check Meta makes when
   * the webhook is saved still answers, and every delivery is refused.
   */
  appSecret?: string
  /** `META_WEBHOOK_VERIFY_TOKEN`: the string typed in the app's Webhooks settings. */
  verifyToken: string
  /**
   * `META_WEBHOOK_AS`: the principal that keeps the comments and DMs (an agent of an owner of the
   * company on the operator's list). Without it, deliveries are acknowledged and only counted.
   */
  as?: string
}

/** One delivery, as Meta sends it: the object type and its changes, possibly batched. */
export interface MetaDelivery {
  object: string
  entry: Record<string, unknown>[]
}

/** Meta batches up to 1000 changes in one delivery. */
const MAX_BODY_BYTES = 5 * 1024 * 1024
/** Meta's challenge is a number; nothing else is written back. */
const CHALLENGE = /^[A-Za-z0-9_-]{1,200}$/

/** True when `header` is `sha256=` and the HMAC-SHA256 of the raw body with the app secret. */
export function signedByMeta(raw: Uint8Array, header: string | undefined, appSecret: string) {
  const given = /^sha256=([0-9a-f]{64})$/i.exec(header ?? '')?.[1]
  if (!given) return false
  const want = createHmac('sha256', appSecret).update(raw).digest()
  return timingSafeEqual(Buffer.from(given, 'hex'), want)
}

/** What came, with no one's words in the log: the handler when no store is wired. */
export async function logDelivery(delivery: MetaDelivery) {
  console.info('meta webhook', delivery.object, delivery.entry.length)
}

/**
 * `GET /webhooks/meta` answers the check Meta makes when the webhook is saved; `POST` takes the
 * changes. A body whose signature does not hold is refused before it is read as JSON. The answer
 * is 200 once the delivery is handled; a failure answers 500, so Meta sends it again (for up to
 * 36 hours), and the handler stores each change once.
 */
export function metaWebhookRoutes(
  hooks: MetaHooks | undefined,
  handle: (delivery: MetaDelivery) => Promise<void> = logDelivery,
) {
  const off = () => new Refused(503, 'PLATFORM_OFF', 'Meta webhooks are not set up')
  return new Hono()
    .get('/webhooks/meta', (c) => {
      if (!hooks) throw off()
      const { verifyToken } = hooks
      const challenge = c.req.query('hub.challenge') ?? ''
      if (
        c.req.query('hub.mode') !== 'subscribe' ||
        !sameKey(c.req.query('hub.verify_token'), verifyToken) ||
        !CHALLENGE.test(challenge)
      ) {
        throw new Refused(403, 'FORBIDDEN', 'wrong verify token')
      }
      return c.text(challenge)
    })
    .post(
      '/webhooks/meta',
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: () => {
          throw new Refused(413, 'TOO_LARGE', 'send at most 5 MB')
        },
      }),
      async (c) => {
        const appSecret = hooks?.appSecret
        if (!appSecret) throw off()
        const raw = new Uint8Array(await c.req.arrayBuffer())
        if (!signedByMeta(raw, c.req.header('x-hub-signature-256'), appSecret)) {
          throw new Refused(401, 'UNAUTHORIZED', 'the signature does not hold')
        }
        let body: unknown
        try {
          body = JSON.parse(Buffer.from(raw).toString('utf8'))
        } catch {
          throw new Refused(400, 'VALIDATION', 'send JSON')
        }
        const delivery = body as Partial<MetaDelivery> | null
        if (
          !delivery ||
          typeof delivery.object !== 'string' ||
          !Array.isArray(delivery.entry) ||
          delivery.entry.some((e) => !e || typeof e !== 'object')
        ) {
          throw new Refused(400, 'VALIDATION', 'send an object and its entries')
        }
        await handle(delivery as MetaDelivery)
        return c.text('EVENT_RECEIVED')
      },
    )
}
