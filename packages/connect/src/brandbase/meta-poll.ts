import { call, clean, type CoreDeps } from '@brandfactory/core/src/run'
import { type Account, bound, PACK } from './accounts'
import { idOf } from './meta-capture'
import { type Incoming } from './meta-inbox'
import { type MetaApp } from './meta'
import { type MetaDelivery } from './meta-webhooks'

/**
 * The regular reads of what Meta's webhooks do not bring yet (docs/executing/meta-capture-plan.md):
 *
 * - Instagram comments, once a minute: Meta sends them by webhook only with Advanced Access
 *   (App Review). Stored with `inbox.meta_receive`, under the id the webhook would give them.
 * - DMs, every 30 seconds, while the app is in Development mode and Meta may send no webhook
 *   (`META_POLL_DMS`, on unless "off"): each Instagram account's and each Page's conversations
 *   read with the Page token, each new message turned into the webhook's own shape and handed to
 *   the same handler (capture first, then the Inbox), so a later webhook of it changes nothing.
 *   Switch it off once webhooks arrive.
 *
 * Both run as the webhook's principal (`META_WEBHOOK_AS`) and start from when each account was
 * linked: nothing older comes in. The log keeps counts only.
 */
export const DM_EVERY_MS = 30_000
export const COMMENTS_EVERY_MS = 60_000
/** After a restart, at most this far back (and never before the account was linked). */
const BACK_MS = 24 * 60 * 60 * 1000
/** Each read starts a little before the last one began: a message written meanwhile is not lost. */
const OVERLAP_MS = 60_000

const CONVERSATION_FIELDS =
  'updated_time,messages.limit(10){id,created_time,from,message,attachments,shares}'
const MEDIA_FIELDS = 'id,timestamp,comments.limit(25){id,text,timestamp,username,from,parent_id}'

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const list = (v: unknown): Json[] => (Array.isArray(obj(v).data) ? (obj(v).data as Json[]) : [])
const timeOf = (v: unknown) => {
  const t = Date.parse(str(v))
  return Number.isNaN(t) ? 0 : t
}

/** A row `account.meta_list` answers. */
interface Linked extends Account {
  brand: string
  platform: 'instagram' | 'facebook'
  linkedAt: string
}

/**
 * One message from the conversations API, as the webhook would send it: the sender, Meta's
 * message id (the webhook's `mid`), the text, and each attachment as a type and a URL.
 */
export function messagingOf(m: Json, to: string) {
  const attachments = [
    ...list(m.attachments).flatMap((a) => {
      const video = str(obj(a.video_data).url)
      const image = str(obj(a.image_data).url)
      return video
        ? [{ type: 'video', payload: { url: video } }]
        : image
          ? [{ type: 'image', payload: { url: image } }]
          : []
    }),
    ...list(m.shares).flatMap((s) =>
      str(s.link) ? [{ type: 'share', payload: { url: str(s.link) } }] : [],
    ),
  ]
  return {
    sender: { id: str(obj(m.from).id) },
    recipient: { id: to },
    timestamp: timeOf(m.created_time),
    message: {
      mid: str(m.id),
      ...(str(m.message) && { text: str(m.message) }),
      ...(attachments.length > 0 && { attachments }),
    },
  }
}

export interface PollOptions {
  as: string
  /** `META_POLL_DMS`: false turns the DM read off. */
  dms: boolean
}

/**
 * The reads, one call each (`dms`, `comments`), for the loop in `host.ts` and for tests. A read
 * already running is not started again.
 */
export function metaPoll(
  core: CoreDeps,
  meta: MetaApp,
  handle: (delivery: MetaDelivery) => Promise<void>,
  opts: PollOptions,
) {
  const started = core.now().getTime()
  /** Where each account's next DM read starts. */
  const since = new Map<string, number>()
  /** The comments each account stored already this run: they are not sent again. */
  const stored = new Map<string, Set<string>>()
  const running = new Set<string>()

  const accounts = async () =>
    (await call(core, {
      authorization: undefined,
      as: opts.as,
      internal: true,
      pack: PACK,
      op: 'account.meta_list',
      input: {},
    })) as Linked[]

  const tokenOf = (a: Linked) => meta.openToken(a.tokens, bound(a.platform, a.brand, a.accountId))
  const floorOf = (a: Linked) => Math.max(timeOf(a.linkedAt), started - BACK_MS)

  /** One run at a time per read; a failure is logged as its name and count. */
  async function once(name: string, run: () => Promise<number[]>) {
    if (running.has(name)) return
    running.add(name)
    try {
      const [read, kept, failed] = await run()
      if (kept || failed) {
        console.info(`meta poll: ${name}, accounts`, read, 'new', kept, 'failed', failed)
      }
    } catch (err) {
      console.error(`meta poll: ${name} failed`, (err as Error).message)
    } finally {
      running.delete(name)
    }
  }

  /** New DMs of one account since its last read, through the webhook's handler. */
  async function dmsOf(a: Linked) {
    const page = a.platform === 'facebook' ? a.accountId : str(a.details.pageId)
    if (!page) return 0
    const key = `${a.platform}:${a.accountId}`
    const begin = core.now().getTime()
    const from = Math.max(since.get(key) ?? floorOf(a), floorOf(a))
    const got = await meta.graph<{ data?: Json[] }>(`/${page}/conversations`, {
      platform: a.platform === 'instagram' ? 'instagram' : 'messenger',
      fields: CONVERSATION_FIELDS,
      limit: '25',
      access_token: tokenOf(a),
    })
    const messaging = (got.data ?? [])
      .filter((c) => timeOf(c.updated_time) >= from)
      .flatMap((c) => list(c.messages))
      .filter((m) => timeOf(m.created_time) >= from)
      // The account's own messages (its replies) are not the Inbox's.
      .filter((m) => ![a.accountId, page].includes(str(obj(m.from).id)) && str(m.id))
      .map((m) => messagingOf(m, a.accountId))
      .sort((x, y) => x.timestamp - y.timestamp)
    if (messaging.length > 0) {
      await handle({
        object: a.platform === 'instagram' ? 'instagram' : 'page',
        entry: [{ id: a.accountId, time: begin, messaging }],
      })
    }
    since.set(key, begin - OVERLAP_MS)
    return messaging.length
  }

  /** New comments on one Instagram account's ten newest posts, into its Inbox. */
  async function commentsOf(a: Linked) {
    const seen = stored.get(a.accountId) ?? new Set<string>()
    stored.set(a.accountId, seen)
    const floor = timeOf(a.linkedAt)
    const got = await meta.graph<{ data?: Json[] }>(`/${a.accountId}/media`, {
      fields: MEDIA_FIELDS,
      limit: '10',
      access_token: tokenOf(a),
    })
    const items: Incoming[] = []
    for (const media of got.data ?? []) {
      for (const c of list(media.comments)) {
        const id = str(c.id)
        const username = clean(str(c.username) || str(obj(c.from).username)).slice(0, 199)
        const at = timeOf(c.timestamp)
        // The brand's own replies, comments made before the link, and ones stored already.
        if (!id || seen.has(id) || at < floor) continue
        if (str(obj(c.from).id) === a.accountId || username === a.username) continue
        items.push({
          id: idOf(id),
          kind: 'comment',
          fromName: username || 'Instagram user',
          fromHandle: username ? `@${username}` : '',
          text: clean(str(c.text) || '(a photo or a sticker)').slice(0, 8000),
          receivedAt: new Date(at || core.now().getTime()).toISOString(),
          external: { comment: id, post: str(media.id) },
        })
      }
    }
    if (items.length > 0) {
      await call(core, {
        authorization: undefined,
        as: opts.as,
        internal: true,
        pack: PACK,
        op: 'inbox.meta_receive',
        input: { platform: 'instagram', account: a.accountId, items, removed: [] },
      })
    }
    for (const i of items) seen.add(i.external.comment!)
    return items.length
  }

  /** Each account in turn; one that fails is counted and the others still run. */
  async function each(pick: (a: Linked) => boolean, read: (a: Linked) => Promise<number>) {
    const rows = (await accounts()).filter(pick)
    let kept = 0
    let failed = 0
    for (const a of rows) {
      try {
        kept += await read(a)
      } catch (err) {
        failed++
        console.error('meta poll: an account did not read', a.platform, (err as Error).message)
      }
    }
    return [rows.length, kept, failed]
  }

  return {
    dms: () =>
      opts.dms
        ? once('dms', () =>
            each((a) => a.platform === 'instagram' || a.platform === 'facebook', dmsOf),
          )
        : Promise.resolve(),
    comments: () => once('comments', () => each((a) => a.platform === 'instagram', commentsOf)),
  }
}

/** The loop: DMs every 30 seconds, comments every minute. Answers a stop. */
export function startMetaPoll(poll: ReturnType<typeof metaPoll>) {
  const timers = [
    setInterval(() => void poll.dms(), DM_EVERY_MS),
    setInterval(() => void poll.comments(), COMMENTS_EVERY_MS),
  ]
  for (const t of timers) t.unref()
  return () => timers.forEach(clearInterval)
}
