import { createHash } from 'node:crypto'
import { Refused } from '@brandfactory/core/src/errors'
import { call, clean, type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import { type Account, bound, PACK, readAccount, type Who } from './accounts'
import { words } from './make'
import { type MetaApp, MetaError, MetaReconnect } from './meta'
import { definite } from './meta-post'
import { viaMeta } from './meta-routes'
import { type MetaDelivery } from './meta-webhooks'

/** Meta's standard messaging window: a DM is answered within 24 hours of the person's message. */
const WINDOW_MS = 24 * 60 * 60 * 1000
/** Instagram takes a DM of up to 1000 bytes. */
const MAX_DM_BYTES = 1000

/** One comment or DM, as `inbox.meta_receive` keeps it. */
export interface Incoming {
  id: string
  kind: 'comment' | 'dm'
  fromName: string
  fromHandle: string
  text: string
  receivedAt: string
  /** What a reply needs: the comment's id, or the person a DM came from. */
  external: { comment?: string; post?: string; sender?: string; mid?: string }
}

/** The comments and DMs one delivery holds, by the account they came to. */
export interface Batch {
  platform: 'instagram' | 'facebook'
  account: string
  items: Incoming[]
  /** Our ids of the messages the person deleted on the platform. */
  removed: string[]
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
/** Meta's text as Postgres can keep it: no NUL, and no half of an emoji. */
const str = (v: unknown) =>
  typeof v === 'string' ? clean(v) : typeof v === 'number' ? String(v) : ''
/** The first characters of a text; a cut can go through an emoji, so it is cleaned after. */
const cut = (text: string, max: number) => clean(text.slice(0, max))

/** Our id for Meta's: the same for every delivery of it, and within the moves' pattern. */
const idOf = (metaId: string) =>
  `meta-${createHash('sha256').update(metaId).digest('base64url').slice(0, 40)}`

/** A time Meta wrote in seconds or milliseconds, as ISO; now when it wrote none. */
function isoOf(value: unknown, now: number) {
  const n = typeof value === 'number' ? value : Number(value)
  const at = new Date(n < 1e12 ? n * 1000 : n)
  // A time no date can hold is Meta's mistake: the message still lands, at the time it came.
  if (!Number.isFinite(n) || n <= 0 || Number.isNaN(at.getTime()) || at.getUTCFullYear() > 9999)
    return new Date(now).toISOString()
  return at.toISOString()
}

/** A DM's attachment, in words: what the person sent (Instagram Messaging, Webhooks). */
const ATTACHMENT: Record<string, string> = {
  ig_reel: 'Shared a reel',
  reel: 'Shared a reel',
  ig_post: 'Shared a post',
  // Instagram's older name for a shared post (Meta retires it after February 2026).
  share: 'Shared a post',
  story_mention: 'Mentioned you in a story',
  image: 'Sent a photo',
  video: 'Sent a video',
  audio: 'Sent a voice message',
  file: 'Sent a file',
}
/** Several of one kind, as one line. */
const SEVERAL: Record<string, string> = { image: 'photos', video: 'videos' }

/** What a DM with no text holds, as one short line; Meta sends only a link to the media. */
export function attachmentWords(message: Json): string {
  if (message.is_unsupported === true) return 'Sent a message Instagram cannot show here'
  const types = (Array.isArray(message.attachments) ? message.attachments : []).map((a) =>
    str(obj(a).type),
  )
  const first = types[0]
  if (!first) return 'Sent a message with no text'
  const plural = SEVERAL[first]
  if (types.length > 1 && plural && types.every((t) => t === first))
    return `Sent ${types.length} ${plural}`
  return ATTACHMENT[first] ?? 'Sent an attachment'
}

/**
 * The comments and DMs in one of Meta's deliveries, by account. A Page's (`object: page`): its
 * Messenger messages and the comments in its `feed`. An Instagram account's (`object:
 * instagram`): its DMs and its `comments`. What the brand itself wrote (echoes, its own replies)
 * is left out, and so is anything else Meta sends (reactions, reads, likes).
 */
export function batchesOf(delivery: MetaDelivery, now: number): Batch[] {
  const platform =
    delivery.object === 'page' ? 'facebook' : delivery.object === 'instagram' ? 'instagram' : null
  if (!platform) return []
  const out: Batch[] = []
  for (const entry of delivery.entry) {
    const account = str(entry.id)
    if (!/^[0-9]{1,30}$/.test(account)) continue
    const items: Incoming[] = []
    const removed: string[] = []
    for (const m of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const e = obj(m)
      const message = obj(e.message)
      const sender = str(obj(e.sender).id)
      const mid = str(message.mid)
      if (!mid || !sender || sender === account || message.is_echo === true) continue
      // The person deleted it: our copy goes too.
      if (message.is_deleted === true) {
        removed.push(idOf(mid))
        continue
      }
      const text = str(message.text) || attachmentWords(message)
      items.push({
        id: idOf(mid),
        kind: 'dm',
        fromName: platform === 'instagram' ? 'Instagram user' : 'Facebook user',
        fromHandle: '',
        text: cut(text, 8000),
        receivedAt: isoOf(e.timestamp, now),
        external: { sender, mid },
      })
    }
    for (const c of Array.isArray(entry.changes) ? entry.changes : []) {
      const change = obj(c)
      const v = obj(change.value)
      const from = obj(v.from)
      if (platform === 'facebook') {
        if (change.field !== 'feed' || v.item !== 'comment') continue
        const comment = str(v.comment_id)
        // A comment removed on the Page: our copy goes too.
        if (v.verb === 'remove' && comment) {
          removed.push(idOf(comment))
          continue
        }
        if (v.verb !== 'add') continue
        if (!comment || str(from.id) === account) continue
        items.push({
          id: idOf(comment),
          kind: 'comment',
          fromName: cut(str(from.name), 200) || 'Facebook user',
          fromHandle: '',
          text: cut(str(v.message) || '(a photo or a sticker)', 8000),
          receivedAt: isoOf(v.created_time, now),
          external: { comment, post: str(v.post_id) },
        })
      } else {
        if (change.field !== 'comments') continue
        const comment = str(v.comment_id) || str(v.id)
        if (!comment || str(from.id) === account) continue
        const username = cut(str(from.username), 199)
        items.push({
          id: idOf(comment),
          kind: 'comment',
          fromName: username || 'Instagram user',
          fromHandle: username ? `@${username}` : '',
          text: cut(str(v.text) || '(a photo or a sticker)', 8000),
          receivedAt: isoOf(entry.time, now),
          external: { comment, post: str(obj(v.media).id) },
        })
      }
    }
    if (items.length > 0 || removed.length > 0) out.push({ platform, account, items, removed })
  }
  return out
}

/**
 * What one delivery holds, by count, for the log: its entries, and the messages Meta sent as
 * `standby` (another app leads the conversation in Conversation Routing, so they are not ours to
 * keep). No one's words or ids.
 */
export function countsOf(delivery: MetaDelivery) {
  let standby = 0
  for (const entry of delivery.entry) {
    if (Array.isArray(entry.standby)) standby += entry.standby.length
  }
  return { object: delivery.object, entries: delivery.entry.length, standby }
}

/** The person's name and @handle on Instagram, once per sender; a lookup that failed is kept too. */
interface Named {
  name: string
  username: string
}
/** The most senders kept in memory; the oldest go first. */
const MAX_NAMES = 2000
/** How long a sender's name is kept before it is read again. */
const NAME_TTL_MS = 24 * 60 * 60 * 1000
/** The most time one name read may take: Meta waits for the delivery's answer. */
const NAME_WAIT_MS = 3000

/**
 * Reads the names of the Instagram people who sent DMs in a batch, with the brand's Page token,
 * from `GET /{IGSID}?fields=name,username` (Instagram Messaging, User Profile). Run as the webhook's
 * principal: `inbox.meta_receive` with nothing in it names the brand that holds the account, then
 * `account.read` opens its sealed token. Any failure leaves the default name: a name is never the
 * reason a message is not kept.
 */
function senderNames(core: CoreDeps, as: string, meta: MetaApp) {
  const names = new Map<string, { at: number; named: Named | null }>()
  /** Until this time no name is read: the principal may not read the account (its loadout). */
  let offUntil = 0
  const asWebhook = (op: string, input: Record<string, unknown>) =>
    call(core, { authorization: undefined, as, internal: true, pack: PACK, op, input })

  async function tokenFor(account: string) {
    const held = (await asWebhook('inbox.meta_receive', {
      platform: 'instagram',
      account,
      items: [],
      removed: [],
    })) as { brand?: string | null }
    if (!held.brand) return null
    const rows = (await asWebhook('account.read', {
      brand: held.brand,
      platform: 'instagram',
    })) as Account[]
    const row = rows[0] ?? null
    if (!viaMeta(row) || row.accountId !== account) return null
    return meta.openToken(row.tokens, bound('instagram', held.brand, account))
  }

  return async (b: Batch) => {
    const now = core.now().getTime()
    if (b.platform !== 'instagram' || now < offUntil) return
    const key = (sender: string) => `${b.account}:${sender}`
    const wanted = [
      ...new Set(
        b.items
          // An Instagram-scoped id is digits: nothing else goes into a Graph path.
          .filter((i) => i.kind === 'dm' && /^[0-9]{1,30}$/.test(i.external.sender ?? ''))
          .map((i) => i.external.sender!)
          .filter((s) => {
            const had = names.get(key(s))
            return !had || now - had.at > NAME_TTL_MS
          }),
      ),
    ]
    if (wanted.length > 0) {
      let token: string | null = null
      try {
        token = await tokenFor(b.account)
      } catch (err) {
        // The principal may not read accounts (its loadout): no names for ten minutes, and one
        // line says why. Any other failure (no brand holds the account) skips this batch only.
        if (err instanceof Refused && err.code === 'FORBIDDEN') {
          offUntil = now + 10 * 60 * 1000
          console.warn('meta webhook: no sender names', err.code)
        }
        return
      }
      if (!token) return
      for (const sender of wanted.slice(0, 20)) {
        let named: Named | null = null
        try {
          const read = meta.graph<{ name?: unknown; username?: unknown }>(`/${sender}`, {
            fields: 'name,username',
            access_token: token,
          })
          const got = await Promise.race([
            read,
            new Promise<null>((r) => setTimeout(() => r(null), NAME_WAIT_MS)),
          ])
          if (got) named = { name: cut(str(got.name), 200), username: cut(str(got.username), 199) }
        } catch {
          // Meta keeps the profile from us (the person's settings, or no consent): the default.
        }
        if (names.size >= MAX_NAMES) names.delete(names.keys().next().value!)
        names.set(key(sender), { at: now, named })
      }
    }
    for (const item of b.items) {
      const named = item.kind === 'dm' && names.get(key(item.external.sender ?? ''))?.named
      if (!named) continue
      if (named.username) item.fromHandle = `@${named.username}`
      item.fromName = named.name || named.username || item.fromName
    }
  }
}

/**
 * Refusals of a batch that a resend gets again: no brand within reach holds the account (also when
 * the principal's person left the company or is deactivated), or Postgres refused the data itself
 * (a bad value, a row that conflicts). A refusal of the principal itself (removed, or its loadout
 * without the move) is not here: a fix within the hour stores what Meta sends again.
 */
const NEVER_STORED = new Set(['NOT_FOUND', 'VALIDATION', 'BAD_INPUT', 'CONFLICT'])

/**
 * The webhook's handler once comments and DMs are kept: each batch goes to `inbox.meta_receive`,
 * run as the principal the settings name (`META_WEBHOOK_AS`), so the pack's walls still apply and
 * an account no brand within its reach holds stores nothing. Without it, deliveries are only
 * counted in the log; `/meta/select` does not subscribe a Page then.
 *
 * Only a failure that can pass answers Meta with an error. Meta unsubscribes a Page after an hour
 * of errors (Messenger Platform, Webhooks), so what can never be stored is logged and left behind.
 */
export function inboxHandler(core: CoreDeps, as: string | undefined, meta?: MetaApp) {
  const name = as && meta ? senderNames(core, as, meta) : null
  return async (delivery: MetaDelivery) => {
    const batches = batchesOf(delivery, core.now().getTime())
    const counts = { ...countsOf(delivery), stored: 0, dropped: 0, removed: 0 }
    if (!as) {
      console.info('meta webhook', JSON.stringify({ ...counts, kept: false }))
      return
    }
    try {
      for (const b of batches) {
        if (name) await name(b)
        try {
          const done = (await call(core, {
            authorization: undefined,
            as,
            internal: true,
            pack: PACK,
            op: 'inbox.meta_receive',
            input: b,
          })) as { stored?: number; removed?: number } | null
          counts.stored += Number(done?.stored ?? 0)
          counts.removed += Number(done?.removed ?? 0)
        } catch (err) {
          // Meta is answered all the same: sending again would not help. The account alone is
          // logged.
          if (!(err instanceof Refused && NEVER_STORED.has(err.code))) throw err
          counts.dropped += b.items.length
          console.error('meta webhook: dropped', err.code, b.platform, b.account)
        }
      }
    } finally {
      // One line for each delivery, also one that fails: Meta sends it again.
      console.info('meta webhook', JSON.stringify(counts))
    }
  }
}

/** What `inbox.meta_read` answers. */
interface Held {
  kind: 'comment' | 'dm'
  platform: 'ig' | 'fb'
  external: Incoming['external'] | null
  receivedAt: string
  open: boolean
}

/**
 * Replies to comments and DMs that came through Meta's webhook, from the brand's Page token, and
 * hides a comment. Every read and write is one of the pack's moves run as the person, so the
 * brand walls hold. A reply claims the message first (`inbox.meta_claim`), so two presses send
 * once, then records what Meta said (`inbox.meta_done`): sent; refused, and still to answer; or
 * unknown, when the answer was lost.
 */
export function metaInboxRoutes(core: CoreDeps, meta: MetaApp | undefined) {
  const who = (c: Context): Who => ({ authorization: c.req.header('authorization') })
  const move = (c: Context, op: string, input: Record<string, unknown>) =>
    call(core, { authorization: who(c).authorization, pack: PACK, op, input, internal: true })

  /** The message, its account and the Page token that answers it. */
  async function held(c: Context) {
    if (!meta) throw new Refused(503, 'PLATFORM_OFF', 'Facebook and Instagram are not set up')
    const brand = c.req.param('brand')!
    const id = c.req.param('id')!
    const m = (await move(c, 'inbox.meta_read', { brand, id })) as Held
    const external = m.external
    if (!external) throw new Refused(409, 'NOT_META', 'this message did not come through Meta')
    const platform = m.platform === 'ig' ? 'instagram' : 'facebook'
    const account = await readAccount(core, who(c), brand, platform)
    if (!viaMeta(account)) {
      throw new Refused(409, 'META_NOT_LINKED', 'connect the account on Connections first')
    }
    let token: string
    try {
      token = meta.openToken(account.tokens, bound(platform, brand, account.accountId))
    } catch {
      throw new Refused(409, 'META_RECONNECT', 'Facebook needs connecting again')
    }
    // A DM is answered from the Page: Instagram's own, through the Page it is linked to.
    const page = platform === 'facebook' ? account.accountId : String(account.details.pageId ?? '')
    return {
      brand,
      id,
      m,
      external,
      platform,
      token,
      page,
      name: m.platform === 'ig' ? 'Instagram' : 'Facebook',
    }
  }

  const unsure = (name: string) =>
    new Refused(
      502,
      'PLATFORM',
      `${name} did not answer. The reply may have gone: check the account before you send it again.`,
    )
  const said = (err: unknown, name: string) => {
    if (err instanceof MetaReconnect) {
      return new Refused(409, 'META_RECONNECT', `Connect ${name} again on Connections.`)
    }
    if (err instanceof MetaError)
      return new Refused(502, 'PLATFORM', `${name}: ${words(err.message)}`)
    console.error('meta reply failed', (err as Error).message)
    return new Refused(
      502,
      'PLATFORM',
      `${name} did not answer. Check the account before you send it again.`,
    )
  }

  return (
    new Hono()
      .post('/brands/:brand/inbox/:id/meta-reply', async (c) => {
        const body = (await c.req.json().catch(() => null)) as { text?: unknown } | null
        const text = typeof body?.text === 'string' ? body.text.trim() : ''
        if (!text) throw new Refused(400, 'VALIDATION', 'send the reply text')
        const h = await held(c)
        if (!h.m.open)
          throw new Refused(409, 'ALREADY_DONE', 'this message was answered or cleared')
        if (h.m.kind === 'dm') {
          if (core.now().getTime() - Date.parse(h.m.receivedAt) > WINDOW_MS) {
            throw new Refused(
              409,
              'META_WINDOW',
              `${h.name} lets a business answer a message within 24 hours of it. Answer in the ${h.name} app.`,
            )
          }
          if (Buffer.byteLength(text) > MAX_DM_BYTES) {
            throw new Refused(400, 'VALIDATION', 'a message of up to 1000 characters')
          }
          if (!h.page || !h.external.sender) throw new Refused(409, 'NOT_META', 'no one to answer')
        } else if (!h.external.comment) {
          throw new Refused(409, 'NOT_META', 'no comment to answer')
        }
        // The claim: a second press, or a second tab, is refused here.
        const claimed = (await move(c, 'inbox.meta_claim', {
          brand: h.brand,
          id: h.id,
          text,
        })) as unknown[]
        if (claimed.length === 0)
          throw new Refused(409, 'SENDING', 'this reply is on its way already')
        try {
          if (h.m.kind === 'dm') {
            await meta!.graph(
              `/${h.page}/messages`,
              {
                recipient: JSON.stringify({ id: h.external.sender }),
                message: JSON.stringify({ text }),
                messaging_type: 'RESPONSE',
                access_token: h.token,
              },
              'POST',
            )
          } else {
            const edge = h.platform === 'instagram' ? 'replies' : 'comments'
            await meta!.graph(
              `/${h.external.comment}/${edge}`,
              { message: text, access_token: h.token },
              'POST',
            )
          }
        } catch (err) {
          // Meta said no (a stated refusal): nothing went, and the message stays to answer. Any
          // other failure, Meta's own "unknown" and "try again" included, may hide a reply that
          // went: it leaves the inbox, and the words say to check the account.
          const refused = definite(err)
          await move(c, 'inbox.meta_done', {
            brand: h.brand,
            id: h.id,
            status: refused ? 'failed' : 'unknown',
          })
          throw refused ? said(err, h.name) : unsure(h.name)
        }
        // Meta took it: the person sees it sent whatever happens to the record. The record is
        // tried twice; if both fail, the claim still holds the message for five minutes, and the
        // log names it.
        const done = () => move(c, 'inbox.meta_done', { brand: h.brand, id: h.id, status: 'sent' })
        try {
          await done().catch(done)
        } catch (err) {
          console.error('meta reply: sent, not recorded', h.brand, h.id, (err as Error).message)
        }
        return c.json({ id: h.id, status: 'sent' })
      })

      // Hides a comment from everyone but its writer and the brand; it leaves the inbox.
      .post('/brands/:brand/inbox/:id/meta-hide', async (c) => {
        const h = await held(c)
        if (h.m.kind !== 'comment' || !h.external.comment) {
          throw new Refused(409, 'NOT_META', 'only a comment can be hidden')
        }
        try {
          await meta!.graph(
            `/${h.external.comment}`,
            {
              ...(h.platform === 'instagram' ? { hide: 'true' } : { is_hidden: 'true' }),
              access_token: h.token,
            },
            'POST',
          )
        } catch (err) {
          throw said(err, h.name)
        }
        await move(c, 'inbox.meta_hidden', { brand: h.brand, id: h.id })
        return c.json({ id: h.id, status: 'hidden' })
      })
  )
}
