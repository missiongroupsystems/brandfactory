import { Refused } from '@brandfactory/core/src/errors'
import { authenticate, call, type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import sharp from 'sharp'
import { bound, PACK, readAccount, type Who } from './accounts'
import { type MetaApp, MetaError, MetaReconnect } from './meta'
import { viaMeta } from './meta-routes'

/**
 * The roster's profile pictures (docs/completions/influencers-phases-1-to-1.md): for each
 * Instagram account on the company's roster, Business Discovery through a brand's Instagram
 * account linked by our own Meta app reads the account's `profile_picture_url` and
 * `followers_count`, and the picture is copied into our files, since Meta's address expires.
 * The same run reads the brands' saved Instagram collaborators no one on the roster holds, with
 * their display `name` too, which fills the name only where the account has none yet
 * (`influencer.profile_*`). Only a business or creator account answers; for anyone else the
 * screens show initials.
 *
 * One run at a time, as the person who started it (`POST /roster/pictures`), in the background:
 * the Production workflow's `roster-pictures` task starts it as the release person and reads
 * `GET /roster/pictures` until it ends. A run reads at most `limit` accounts (those never read
 * first, then those not read for 30 days: `influencer.picture_due`), one Graph call every
 * `gapMs`, and stops at Meta's first rate limit. The log holds counts only, never a handle.
 */

/**
 * Business Discovery's calls count against the Instagram account's hourly limit (about 200),
 * which the brand's own reads (the Inbox, the Feed) share: a run takes a small part of it.
 */
export const DEFAULT_LIMIT = 30
export const MAX_LIMIT = 150
const DEFAULT_GAP_MS = 2_000
/** A profile picture is small; anything larger is not one. */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024
/** Meta's code for "Cannot find User" on Business Discovery (subcode 2207013). */
const NOT_FOUND = 110
/** Meta's rate limits: application, user, Page, custom and Instagram's own. */
const RATE_LIMITED = new Set([4, 17, 32, 613, 80002])
/** Meta's media hosts: a picture is read from nowhere else, a redirect included. */
const META_MEDIA = /(^|\.)(fbcdn\.net|cdninstagram\.com)$/
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
/**
 * The side of the square a picture is kept at. Meta sends up to 1080px (about 120 KB); the
 * screens show it at 28 to 36px, so 160px covers a 36px avatar on a 3x screen, at a few KB.
 */
export const THUMB_PX = 160

/**
 * The most pixels a picture may have: twice Meta's 1080px a side. A larger one (a 7000px PNG
 * fits in 5 MB and decodes to about 200 MB) is no profile picture, on a 512 MB machine.
 */
export const MAX_PICTURE_PIXELS = 2160 * 2160
// One picture at a time, and nothing kept between them: memory stays flat through a run.
sharp.cache(false)
sharp.concurrency(1)

/**
 * A picture as it is kept: a small square WebP. Null when the bytes are no picture we take (no
 * image, or too many pixels): the initials stay. Any other failure throws, so the read counts as
 * failed, not as an account with no picture.
 */
async function thumbnail(bytes: Uint8Array): Promise<Uint8Array | null> {
  const input = () => sharp(bytes, { limitInputPixels: MAX_PICTURE_PIXELS })
  const meta = await input()
    .metadata()
    .catch(() => null)
  if (!meta?.width || !meta.height || meta.width * meta.height > MAX_PICTURE_PIXELS) return null
  const out = await input()
    .rotate()
    .resize(THUMB_PX, THUMB_PX, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer()
  return new Uint8Array(out)
}
const USERNAME = /^[a-z0-9._]{1,30}$/

/** What one run did, in counts. */
export interface PictureRun {
  running: boolean
  startedAt: string
  finishedAt: string | null
  due: number
  /** Accounts Meta answered for. */
  read: number
  /** Pictures copied into our files. */
  pictures: number
  /** Meta answered but showed no picture, or the picture did not copy (initials stay). */
  noPicture: number
  /** Not a business or creator account, or no such user: initials stay. */
  notFound: number
  /** Graph calls that failed for another reason; the account is read again next run. */
  failed: number
  /** Why the run stopped early, if it did. */
  stopped: 'rate limit' | 'reconnect' | 'no linked account' | null
}

export interface RosterPictureOptions {
  /** For tests: the picture reads and the storage writes. */
  fetch?: typeof fetch
  /** For tests: the wait between two Graph calls. */
  gapMs?: number
  sleep?: (ms: number) => Promise<void>
}

export function rosterPictureRoutes(
  core: CoreDeps,
  meta: MetaApp | undefined,
  opts: RosterPictureOptions = {},
) {
  const get = opts.fetch ?? fetch
  const gapMs = opts.gapMs ?? DEFAULT_GAP_MS
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let last: PictureRun | null = null
  let current: Promise<void> | null = null

  const move = (who: Who, op: string, input: Record<string, unknown>) =>
    call(core, { authorization: who.authorization, pack: PACK, op, input, internal: true })

  /**
   * The companies the caller is an owner or an admin of (`account.me`): only they start a picture
   * run or bring in profiles, which spend the company's Meta calls and write its files.
   */
  async function managed(who: Who): Promise<string[]> {
    const me = (await call(core, {
      authorization: who.authorization,
      pack: PACK,
      op: 'account.me',
      input: {},
    })) as { companies?: { id: string; role: string }[] }
    return (me.companies ?? [])
      .filter((c) => c.role === 'owner' || c.role === 'admin')
      .map((c) => c.id)
  }

  /** The first of the caller's brands (or the one named) with Instagram linked through Meta. */
  async function linked(who: Who, brand: string | undefined) {
    const brands = brand
      ? [brand]
      : (
          (await call(core, {
            authorization: who.authorization,
            pack: PACK,
            op: 'brand.list',
            input: {},
          })) as { id: string }[]
        ).map((b) => b.id)
    for (const id of brands) {
      const account = await readAccount(core, who, id, 'instagram')
      if (!viaMeta(account)) continue
      try {
        return {
          igId: account.accountId,
          token: meta!.openToken(account.tokens, bound('instagram', id, account.accountId)),
        }
      } catch {
        // Its token no longer opens: try the next brand.
      }
    }
    return null
  }

  /** Reads Meta's picture, from Meta's hosts only, redirects followed by hand. */
  async function readPicture(address: string): Promise<Response | null> {
    let url = address
    for (let hop = 0; hop < 4; hop++) {
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        return null
      }
      if (parsed.protocol !== 'https:' || !META_MEDIA.test(parsed.hostname)) return null
      const res = await get(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
      if (res.status >= 300 && res.status < 400) {
        void res.body?.cancel().catch(() => undefined)
        const next = res.headers.get('location')
        if (!next) return null
        url = new URL(next, url).toString()
        continue
      }
      return res
    }
    return null
  }

  /** Who a due account is: a roster person's (by person id) or a saved collaborator's (by company). */
  type Due = { id: string; handle: string } | { org: string; handle: string }

  /**
   * Copies one picture into our files; answers its stable address, or null when Meta's answer is
   * no picture we take. A failure on the way (the network, the storage, the resize) throws.
   */
  async function copy(who: Who, due: Due, address: string) {
    const got = await readPicture(address)
    if (!got?.ok || !got.body) {
      void got?.body?.cancel().catch(() => undefined)
      return null
    }
    // The type and the stated length first: nothing else is read.
    const mime = (got.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const stated = Number(got.headers.get('content-length') ?? NaN)
    if (!TYPES.has(mime) || (Number.isFinite(stated) && stated > MAX_PICTURE_BYTES)) {
      void got.body.cancel().catch(() => undefined)
      return null
    }
    // Read with a cap: a body longer than it says is cut off at the cap.
    const parts: Uint8Array[] = []
    let size = 0
    const reader = got.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PICTURE_BYTES) {
        void reader.cancel().catch(() => undefined)
        return null
      }
      parts.push(value)
    }
    if (size === 0) return null
    const read = new Uint8Array(size)
    let at = 0
    for (const part of parts) {
      read.set(part, at)
      at += part.byteLength
    }
    // Kept small: the list of people loads each one at once (THUMB_PX).
    const bytes = await thumbnail(read)
    if (!bytes) return null
    const made = (await move(
      who,
      'id' in due ? 'influencer.picture_file' : 'influencer.profile_file',
      { ...due, mime: 'image/webp' },
    )) as {
      src: string
      upload: { url: string; headers: Record<string, string> }
    }
    const put = await get(made.upload.url, {
      method: 'PUT',
      headers: { ...made.upload.headers, 'content-length': String(bytes.length) },
      body: bytes,
      signal: AbortSignal.timeout(60_000),
    })
    if (!put.ok) throw new Error(`upload ${put.status}`)
    return made.src
  }

  /** Records a read: a roster account's picture and followers, or a saved account's too. */
  const recordRead = (
    who: Who,
    account: Due,
    src: string | null,
    followers: number | null,
    name: unknown,
  ) =>
    'id' in account
      ? move(who, 'influencer.picture_set', { ...account, src, followers })
      : move(who, 'influencer.profile_set', {
          ...account,
          src,
          followers,
          name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : null,
        })

  async function run(who: Who, run: PictureRun, limit: number, brand: string | undefined) {
    const from = await linked(who, brand)
    if (!from) {
      run.stopped = 'no linked account'
      return
    }
    const due = (await move(who, 'influencer.picture_due', { limit })) as Due[]
    run.due = due.length
    const record = (account: Due, src: string | null, followers: number | null, name: unknown) =>
      recordRead(who, account, src, followers, name)
    for (const [n, account] of due.entries()) {
      if (n > 0) await sleep(gapMs)
      if (!USERNAME.test(account.handle)) continue
      let found:
        | { profile_picture_url?: unknown; followers_count?: unknown; name?: unknown }
        | undefined
      try {
        const got = await meta!.graph<{ business_discovery?: typeof found }>(`/${from.igId}`, {
          fields: `business_discovery.username(${account.handle}){name,profile_picture_url,followers_count}`,
          access_token: from.token,
        })
        found = got.business_discovery
      } catch (err) {
        if (err instanceof MetaReconnect) {
          run.stopped = 'reconnect'
          return
        }
        if (err instanceof MetaError && err.code !== null && RATE_LIMITED.has(err.code)) {
          run.stopped = 'rate limit'
          return
        }
        if (err instanceof MetaError && err.code === NOT_FOUND) {
          run.notFound++
          await record(account, null, null, null)
          continue
        }
        // Read again in 30 days, not first in every run: the run moves on to the others.
        run.failed++
        await record(account, null, null, null).catch(() => undefined)
        continue
      }
      run.read++
      const followers =
        typeof found?.followers_count === 'number' && Number.isInteger(found.followers_count)
          ? found.followers_count
          : null
      let src: string | null = null
      if (typeof found?.profile_picture_url === 'string') {
        try {
          src = await copy(who, account, found.profile_picture_url)
        } catch {
          // Not "no picture": a failed copy. The read waits like any failed one, and its picture
          // stays as it was; the followers and the name Meta gave are kept.
          run.failed++
          await record(account, null, followers, found?.name).catch(() => undefined)
          continue
        }
      }
      if (src) run.pictures++
      else run.noPicture++
      await record(account, src, followers, found?.name)
    }
  }

  return new Hono()
    .post('/roster/profiles', async (c: Context) => {
      // Profiles read elsewhere through Business Discovery (one JSON object a line, as a read
      // made on the server prints them): each picture is copied into our files from Meta's hosts, and the
      // name fills only an empty one. A roster account is matched by its handle in the company;
      // any other handle is a saved account of the company.
      const who: Who = { authorization: c.req.header('authorization') }
      await authenticate(core.auth, who.authorization)
      const org = c.req.query('org') ?? ''
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(org)) throw new Refused(400, 'VALIDATION', 'send org')
      if (!(await managed(who)).includes(org)) {
        throw new Refused(
          403,
          'FORBIDDEN',
          "only the company's owners and admins bring in profiles",
        )
      }
      const body = (await c.req.json().catch(() => null)) as { profiles?: unknown } | null
      const list = Array.isArray(body?.profiles)
        ? (body.profiles as Record<string, unknown>[])
        : null
      if (!list || list.length > MAX_LIMIT) {
        throw new Refused(400, 'VALIDATION', `send profiles, at most ${MAX_LIMIT}`)
      }
      const roster = (await call(core, {
        authorization: who.authorization,
        pack: PACK,
        op: 'influencer.list',
        input: {},
      })) as { id: string; orgId: string; accounts: { platform: string; handle: string }[] }[]
      const held = new Map<string, string>()
      for (const p of roster) {
        if (p.orgId !== org) continue
        for (const a of p.accounts) if (a.platform === 'instagram') held.set(a.handle, p.id)
      }
      const counts = { read: 0, pictures: 0, noPicture: 0, skipped: 0, failed: 0 }
      for (const p of list) {
        const handle = String(p.handle ?? '')
          .replace(/^@+/, '')
          .toLowerCase()
        if (!USERNAME.test(handle)) {
          counts.skipped++
          continue
        }
        const id = held.get(handle)
        const due: Due = id ? { id, handle } : { org, handle }
        const followers =
          typeof p.followers === 'number' && Number.isInteger(p.followers) && p.followers >= 0
            ? p.followers
            : null
        try {
          const src =
            // A failed copy throws: the profile counts as failed, not as one with no picture.
            typeof p.picture === 'string' ? await copy(who, due, p.picture) : null
          if (src) counts.pictures++
          else counts.noPicture++
          await recordRead(who, due, src, followers, p.name)
          counts.read++
        } catch {
          counts.failed++
        }
      }
      console.info('roster profiles:', JSON.stringify(counts))
      return c.json(counts)
    })
    .post('/roster/pictures', async (c: Context) => {
      if (!meta) throw new Refused(503, 'PLATFORM_OFF', 'Facebook and Instagram are not set up')
      const who: Who = { authorization: c.req.header('authorization') }
      await authenticate(core.auth, who.authorization)
      if ((await managed(who)).length === 0) {
        throw new Refused(
          403,
          'FORBIDDEN',
          "only a company's owners and admins start a picture run",
        )
      }
      if (current) throw new Refused(409, 'RUNNING', 'a picture run is on its way')
      const asked = Number(c.req.query('limit') ?? DEFAULT_LIMIT)
      const limit =
        Number.isInteger(asked) && asked >= 1 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT
      const brand = c.req.query('brand')
      if (brand !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(brand)) {
        throw new Refused(400, 'VALIDATION', 'send a brand id')
      }
      // The caller's reach is checked before the run starts: one who reaches nothing is refused.
      await move(who, 'influencer.picture_due', { limit: 1 })
      const state: PictureRun = {
        running: true,
        startedAt: core.now().toISOString(),
        finishedAt: null,
        due: 0,
        read: 0,
        pictures: 0,
        noPicture: 0,
        notFound: 0,
        failed: 0,
        stopped: null,
      }
      last = state
      current = run(who, state, limit, brand)
        .catch((err: unknown) => {
          state.failed++
          console.error('roster pictures: the run failed', (err as Error).message)
        })
        .finally(() => {
          state.running = false
          state.finishedAt = core.now().toISOString()
          current = null
          const { running: _r, startedAt: _s, finishedAt: _f, ...counts } = state
          console.info('roster pictures:', JSON.stringify(counts))
        })
      return c.json(state, 202)
    })
    .get('/roster/pictures', async (c) => {
      await authenticate(core.auth, c.req.header('authorization'))
      c.header('cache-control', 'no-store')
      return c.json(last ?? { running: false })
    })
}
