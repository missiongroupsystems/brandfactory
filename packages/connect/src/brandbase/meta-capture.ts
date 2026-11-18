import { createHash, createHmac, randomInt } from 'node:crypto'
import { Refused } from '@brandfactory/core/src/errors'
import { authenticate, call, type CoreDeps } from '@brandfactory/core/src/run'
import { Hono } from 'hono'
import { type Account, bound, PACK } from './accounts'
import { type MetaApp } from './meta'
import { viaMeta } from './meta-routes'
import { inboxHandler } from './meta-inbox'
import { type MetaDelivery, type MetaHooks } from './meta-webhooks'

/**
 * Instagram capture (docs/executing/meta-capture-plan.md): a person DMs a reel or a post to the
 * capture account, and it lands in one of their brands' Ideas, under Shared. The capture account
 * is the Instagram account linked through Meta of the brand `META_CAPTURE_BRAND` names; its id,
 * handle, Page and Page token come from that row, so no second setting can drift from it.
 *
 * The webhook's handler runs `route` first. On the capture account it takes out what is the
 * capture's (a LINK code, a brand tap, a share from a linked sender) and leaves the rest for the
 * Inbox: the demo uses one account for both. What is claimed or linked is written before Meta's
 * 200; replies to Instagram and the copy of the media run after it, as jobs.
 */

/** The largest reel or post copied: a 90-second reel fits. */
export const MAX_CAPTURE_BYTES = 100 * 1024 * 1024
/** One copy may take this long, from Meta's read to the last byte stored. */
const COPY_WAIT_MS = 120_000
/** How long the capture account's row is kept in memory before it is read again. */
const ACCOUNT_TTL_MS = 60_000
/** Instagram shows at most 13 quick replies, each title at most 20 characters. */
const MAX_CHOICES = 13
const MAX_TITLE = 20
/** A brand choice waits this long for a tap, or a typed brand name. */
const CHOICE_MS = 24 * 60 * 60 * 1000
/** Code letters with no look-alikes (no 0, O, 1, I or L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
const LINK = /^\s*link\s+([a-z0-9]{6,12})\s*$/i
const TAP = /^cap:([A-Za-z0-9_-]{1,80}):([A-Za-z0-9_-]{1,80})$/
/** Attachments that carry a post to keep: shares, and a photo or a video sent as it is. */
const SHARES = new Set(['ig_reel', 'reel', 'ig_post', 'share', 'image', 'video'])
/** Meta's media hosts: media is read from nowhere else, a redirect included. */
const META_MEDIA = /(^|\.)(fbcdn\.net|cdninstagram\.com|fbsbx\.com)$/
const TYPES: Record<string, 'video' | 'image'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
}

/** What the account says, in plain words. */
export const SAY = {
  linked: (name: string) =>
    `Linked to ${name}. Share a reel or a post here and it goes to Ideas in Brand Base.`,
  wrongCode: 'This code does not work. In Brand Base, open Ideas and press Add from Instagram.',
  limited: 'Too many tries. Wait one hour, then send a new code.',
  howTo:
    'To save posts to Brand Base, open Ideas in Brand Base, press Add from Instagram and send the code here.',
  pick: 'Which brand is this for?',
  saved: (brand: string) => `Saved to ${brand}. It is in Ideas, under Shared.`,
  noBrand: 'Your Brand Base account has no brand yet.',
  failed: 'This post did not save. Share it again.',
}

/** Our id for Meta's: the same as `meta-inbox.ts`'s, so a capture and a DM never share one. */
export const idOf = (metaId: string) =>
  `meta-${createHash('sha256').update(metaId).digest('base64url').slice(0, 40)}`

/**
 * A code as `capture.code` keeps it: its HMAC-SHA256 under the app secret, so a reader of the table
 * cannot try every code offline.
 */
export const hashOf = (code: string, secret: string) =>
  createHmac('sha256', secret).update(`capture-code:${code.toUpperCase()}`).digest('hex')

/** A new link code: 8 letters and digits, about 40 bits. */
export const newCode = () =>
  Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

/** The capture account, read from the capture brand's Instagram row. */
export interface CaptureAccount {
  id: string
  handle: string
  pageId: string
  token: string
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/** A brand offered for a share: its quick reply's title and its name. */
interface Choice {
  brand: string
  name: string
  title: string
}

/** A title Instagram shows whole. */
const titleOf = (name: string) =>
  [...name].length > MAX_TITLE ? `${[...name].slice(0, MAX_TITLE - 1).join('')}…` : name

export interface CaptureOptions {
  /** `META_CAPTURE_BRAND`: the brand whose Instagram account is the capture account. */
  brand?: string
  /** `META_WEBHOOK_AS`: the principal that reads the capture account and its senders. */
  as?: string
  /** `META_APP_SECRET`: it keys the codes' hashes (the webhook needs it anyway). */
  secret?: string
  /** For tests: Meta's media reads and the storage writes. */
  fetch?: typeof fetch
  maxBytes?: number
}

/**
 * The capture side of the webhook, and its two routes for the Ideas page. Off (every delivery
 * left as it is, the routes answering that capture is off) until the brand, the principal and our
 * own Meta app are set and the brand's Instagram account is linked through Meta.
 */
export function metaCapture(core: CoreDeps, meta: MetaApp | undefined, opts: CaptureOptions) {
  const get = opts.fetch ?? fetch
  const maxBytes = opts.maxBytes ?? MAX_CAPTURE_BYTES
  const asAgent = (op: string, input: Json) =>
    call(core, { authorization: undefined, as: opts.as, internal: true, pack: PACK, op, input })
  const asPerson = (person: string, op: string, input: Json) =>
    call(core, { authorization: undefined, as: person, internal: true, pack: PACK, op, input })

  let cached: { at: number; account: CaptureAccount | null } | null = null
  let warned = ''
  /** Brand choices waiting for a tap, by account and sender. */
  const pending = new Map<string, { id: string; person: string; choices: Choice[]; at: number }>()
  /**
   * Meta's ids of the messages the capture took lately: the webhook and the DM read may both bring
   * one, and a tap read the second time no longer finds its question.
   */
  const taken = new Set<string>()
  const remember = (mid: string) => {
    taken.add(mid)
    if (taken.size > 5000) taken.delete(taken.values().next().value!)
  }
  /** The jobs that run after Meta's 200, one after another. */
  let queue: Promise<void> = Promise.resolve()
  const later = (name: string, job: () => Promise<void>) => {
    queue = queue.then(job).catch((err: unknown) => {
      console.error('meta capture:', name, 'failed', (err as Error).message)
    })
  }

  const warnOnce = (why: string) => {
    if (warned === why) return
    warned = why
    console.error('meta capture: off,', why)
  }

  /** The capture account, or null while capture is off. */
  async function account(): Promise<CaptureAccount | null> {
    if (!opts.brand || !opts.as || !opts.secret || !meta) return null
    const now = core.now().getTime()
    if (cached && now - cached.at < ACCOUNT_TTL_MS) return cached.account
    let found: CaptureAccount | null = null
    try {
      const rows = (await asAgent('account.read', {
        brand: opts.brand,
        platform: 'instagram',
      })) as Account[]
      const row = rows[0] ?? null
      if (!viaMeta(row)) warnOnce('the capture brand has no Instagram account linked through Meta')
      else {
        found = {
          id: row.accountId,
          handle: row.username,
          pageId: String(row.details.pageId ?? ''),
          token: meta.openToken(row.tokens, bound('instagram', opts.brand, row.accountId)),
        }
        warned = ''
      }
    } catch (err) {
      warnOnce(`its Instagram account does not read: ${(err as Error).message}`)
    }
    cached = { at: now, account: found }
    return found
  }

  /** A DM from the capture account, within Instagram's 24-hour window of the sender's message. */
  async function reply(
    acc: CaptureAccount,
    sender: string,
    text: string,
    ask?: { id: string; choices: Choice[] },
  ) {
    const message: Json = { text }
    // Each tap names the capture and the brand: a resend, or a restart, still finds both.
    if (ask) {
      message.quick_replies = ask.choices.map((c) => ({
        content_type: 'text',
        title: c.title,
        payload: `cap:${ask.id}:${c.brand}`,
      }))
    }
    await meta!.graph(
      `/${acc.pageId}/messages`,
      {
        recipient: JSON.stringify({ id: sender }),
        message: JSON.stringify(message),
        messaging_type: 'RESPONSE',
        access_token: acc.token,
      },
      'POST',
    )
  }

  /** The person's brands, the one they saved to last first, as Instagram can show them. */
  async function choicesFor(person: string, last: string | null): Promise<Choice[]> {
    const brands = (await asPerson(person, 'brand.list', {})) as { id: string; name: string }[]
    const ordered = [
      ...brands.filter((b) => b.id === last),
      ...brands.filter((b) => b.id !== last),
    ].slice(0, MAX_CHOICES)
    return ordered.map((b) => ({ brand: b.id, name: b.name, title: titleOf(b.name) }))
  }

  /** Meta's media read: its hosts only, redirects checked one by one. */
  async function readMedia(address: string): Promise<Response> {
    let at = address
    for (let hop = 0; hop < 4; hop++) {
      const url = new URL(at)
      if (url.protocol !== 'https:' || url.port !== '' || !META_MEDIA.test(url.hostname)) {
        throw new Error(`not a Meta media host: ${url.host}`)
      }
      const res = await get(at, { redirect: 'manual', signal: AbortSignal.timeout(COPY_WAIT_MS) })
      const next = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && next) {
        void res.body?.cancel().catch(() => undefined)
        at = new URL(next, at).toString()
        continue
      }
      return res
    }
    throw new Error('too many redirects')
  }

  /**
   * Copies the shared media into our files, streamed (the server has 512 MB), and gives the
   * capture its stable address. Answers what `capture.save` said.
   */
  async function copy(person: string, id: string, address: string) {
    const got = await readMedia(address)
    const drop = (why: string) => {
      void got.body?.cancel().catch(() => undefined)
      return new Error(why)
    }
    if (!got.ok || !got.body) throw drop(`media ${got.status}`)
    const mime = (got.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const kind = TYPES[mime]
    if (!kind) throw drop(`media is ${mime || 'of no type'}`)
    const length = Number(got.headers.get('content-length') ?? NaN)
    if (length > maxBytes) throw drop('media too large')
    const made = (await asPerson(person, 'capture.file', { id, mime })) as {
      src: string
      upload: { url: string; headers: Record<string, string> }
    }
    let sent = 0
    const counted = got.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, out) {
          sent += chunk.byteLength
          if (sent > maxBytes) out.error(new Error('media too large'))
          else out.enqueue(chunk)
        },
      }),
    )
    // Storage needs the length to take a stream; without one the body is read first, capped.
    const body = Number.isFinite(length)
      ? counted
      : new Uint8Array(await new Response(counted).arrayBuffer())
    const put = await get(made.upload.url, {
      method: 'PUT',
      headers: {
        ...made.upload.headers,
        'content-length': String(Number.isFinite(length) ? length : (body as Uint8Array).length),
      },
      body,
      // A stream goes as it reads (Node's fetch needs it named).
      ...({ duplex: 'half' } as object),
      signal: AbortSignal.timeout(COPY_WAIT_MS),
    })
    if (!put.ok) throw new Error(`upload ${put.status}`)
    return (await asPerson(person, 'capture.save', {
      id,
      brand: null,
      src: made.src,
      kind,
    })) as Saved
  }

  interface Saved {
    saved: boolean
    brand: string | null
    brandName: string | null
    stored: boolean
  }

  /** After a share is claimed: ask which brand (or save at once), and copy its media. */
  function afterShare(
    acc: CaptureAccount,
    sender: string,
    person: string,
    last: string | null,
    id: string,
    address: string,
  ) {
    later('share', async () => {
      const choices = await choicesFor(person, last)
      if (choices.length === 0) {
        await reply(acc, sender, SAY.noBrand)
        return
      }
      if (choices.length === 1) {
        await asPerson(person, 'capture.save', {
          id,
          brand: choices[0]!.brand,
          src: null,
          kind: null,
        })
      } else {
        const now = core.now().getTime()
        // Questions nobody answered within a day go, so the map stays small.
        for (const [key, wait] of pending) if (now - wait.at > CHOICE_MS) pending.delete(key)
        pending.set(`${acc.id}:${sender}`, { id, person, choices, at: now })
        await reply(acc, sender, SAY.pick, { id, choices })
      }
      let saved: Saved
      try {
        saved = await copy(person, id, address)
      } catch (err) {
        console.error('meta capture: media not copied', (err as Error).message)
        await reply(acc, sender, SAY.failed)
        return
      }
      if (saved.saved) await reply(acc, sender, SAY.saved(saved.brandName ?? 'your brand'))
    })
  }

  /** A brand picked for a waiting share: by its quick reply, or by its name typed. */
  async function picked(
    acc: CaptureAccount,
    sender: string,
    person: string,
    id: string,
    brand: string,
  ) {
    const saved = (await asPerson(person, 'capture.save', {
      id,
      brand,
      src: null,
      kind: null,
    })) as Saved
    pending.delete(`${acc.id}:${sender}`)
    if (saved.saved) {
      const name = saved.brandName ?? 'your brand'
      later('saved', () => reply(acc, sender, SAY.saved(name)))
    }
    return true
  }

  /** The brand a typed text names among the sender's waiting choices, or null. */
  function typedChoice(acc: CaptureAccount, sender: string, text: string) {
    const wait = pending.get(`${acc.id}:${sender}`)
    if (!wait || core.now().getTime() - wait.at > CHOICE_MS) return null
    const t = text.trim().toLowerCase()
    return (
      wait.choices.find((c) => c.title.toLowerCase() === t || c.name.toLowerCase() === t)?.brand ??
      null
    )
  }

  /**
   * One message to the capture account: true when it is the capture's, so the Inbox never keeps
   * it. A refusal the capture cannot fix (the principal does not reach the capture brand) leaves
   * the message to the Inbox, as before capture.
   */
  async function take(acc: CaptureAccount, event: Json): Promise<boolean> {
    const message = obj(event.message)
    const sender = str(obj(event.sender).id)
    const mid = str(message.mid)
    if (!mid || !sender || sender === acc.id || message.is_echo === true) return false
    const text = str(message.text)

    // A message deleted on Instagram takes its capture with it; the Inbox removes its own too.
    if (message.is_deleted === true) {
      const who = (await asAgent('capture.sender', {
        account: acc.id,
        sender,
        hint: false,
      })) as { userId: string | null }
      if (who.userId) {
        await asPerson(who.userId, 'capture.drop', { id: idOf(mid) }).catch((err: unknown) => {
          if (!(err instanceof Refused && err.status === 404)) throw err
        })
      }
      return false
    }

    const code = LINK.exec(text)?.[1]
    if (code) {
      const done = (await asAgent('capture.link', {
        account: acc.id,
        sender,
        mid: idOf(mid),
        codeHash: hashOf(code, opts.secret!),
      })) as { fresh: boolean; linked: string | null; limited: boolean }
      if (done.fresh) {
        const words = done.linked
          ? SAY.linked(done.linked)
          : done.limited
            ? SAY.limited
            : SAY.wrongCode
        if (done.linked) pending.delete(`${acc.id}:${sender}`)
        later('link', () => reply(acc, sender, words))
      }
      return true
    }

    const attachments = (Array.isArray(message.attachments) ? message.attachments : []).map(obj)
    const share = attachments.find((a) => SHARES.has(str(a.type)) && str(obj(a.payload).url))
    const tap = str(obj(message.quick_reply).payload)
    if (!share && !tap && !(text && pending.has(`${acc.id}:${sender}`))) return false

    const who = (await asAgent('capture.sender', {
      account: acc.id,
      sender,
      hint: Boolean(share),
    })) as { userId: string | null; lastBrand: string | null; hint: boolean }
    if (!who.userId) {
      if (who.hint) later('how-to', () => reply(acc, sender, SAY.howTo))
      return false
    }

    if (share) {
      const id = idOf(mid)
      const claimed = (await asAgent('capture.claim', { account: acc.id, sender, id })) as {
        userId: string | null
      }
      // Claimed before: Meta sent it again, or the fallback read found it too.
      if (claimed.userId) {
        afterShare(acc, sender, claimed.userId, who.lastBrand, id, str(obj(share.payload).url))
      }
      return true
    }

    const tapped = TAP.exec(tap)
    const wait = pending.get(`${acc.id}:${sender}`)
    const id = tapped ? tapped[1]! : wait?.id
    const brand = tapped ? tapped[2]! : tap ? null : typedChoice(acc, sender, text)
    if (!id || !brand) return false
    try {
      return await picked(acc, sender, who.userId, id, brand)
    } catch (err) {
      // A brand the person no longer reaches, or a capture gone: nothing to save.
      if (err instanceof Refused && err.status === 404) return true
      throw err
    }
  }

  return {
    account,

    /** Waits for the jobs queued so far (tests, and a clean stop). */
    idle: async () => {
      for (let seen = queue; ; seen = queue) {
        await seen
        if (seen === queue) return
      }
    },

    /** The delivery without the capture's messages. Anything else is left as it is. */
    async route(delivery: MetaDelivery): Promise<MetaDelivery> {
      if (delivery.object !== 'instagram') return delivery
      const acc = await account()
      if (!acc) return delivery
      let count = 0
      const entry: Json[] = []
      for (const e of delivery.entry) {
        if (str(e.id) !== acc.id || !Array.isArray(e.messaging)) {
          entry.push(e)
          continue
        }
        const kept: unknown[] = []
        for (const m of e.messaging) {
          const message = obj(obj(m).message)
          const mid = str(message.mid)
          // A delete names the message it deletes: it always runs.
          let mine = message.is_deleted !== true && taken.has(mid)
          try {
            if (!mine) mine = await take(acc, obj(m))
          } catch (err) {
            if (!(err instanceof Refused && err.status < 500)) throw err
            console.error('meta capture: refused', err.code)
          }
          if (mine) {
            count++
            remember(mid)
          } else kept.push(m)
        }
        entry.push({ ...e, messaging: kept })
      }
      if (count > 0) console.info('meta capture:', count, 'taken')
      return { ...delivery, entry }
    },

    /**
     * `GET /capture`: the capture account's handle, for the Ideas page (public: it is an Instagram
     * handle). `POST /capture/code`: a new link code for the signed-in person, for ten minutes.
     */
    routes: new Hono()
      .get('/capture', async (c) => {
        const acc = await account()
        return c.json({ handle: acc ? acc.handle : null })
      })
      .post('/capture/code', async (c) => {
        const authorization = c.req.header('authorization')
        await authenticate(core.auth, authorization)
        const acc = await account()
        if (!acc) throw new Refused(503, 'PLATFORM_OFF', 'Instagram capture is not set up')
        const code = newCode()
        const made = (await call(core, {
          authorization,
          internal: true,
          pack: PACK,
          op: 'capture.code',
          input: { account: acc.id, codeHash: hashOf(code, opts.secret!) },
        })) as { expiresAt: string }
        return c.json({ code, expiresAt: made.expiresAt, handle: acc.handle })
      }),
  }
}

export type MetaCapture = ReturnType<typeof metaCapture>

/**
 * What the webhook does with a delivery, and what the regular DM read hands it too: the capture
 * takes its messages first, then the Inbox keeps the rest (`inbox.meta_receive`).
 */
export function metaHandler(
  core: CoreDeps,
  meta: MetaApp | undefined,
  hooks?: MetaHooks,
  /** For tests: Meta's media reads and the storage writes. */
  fetchFor?: typeof fetch,
) {
  const capture = metaCapture(core, meta, {
    brand: hooks?.captureBrand,
    as: hooks?.as,
    secret: hooks?.appSecret,
    fetch: fetchFor,
  })
  const inbox = inboxHandler(core, hooks?.as, meta)
  return {
    capture,
    handle: async (delivery: MetaDelivery) => inbox(await capture.route(delivery)),
  }
}

export type MetaHandler = ReturnType<typeof metaHandler>
