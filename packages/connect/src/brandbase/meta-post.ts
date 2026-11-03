import { call, type CoreDeps } from '@brandfactory/core/src/run'
import { type Account, bound, PACK } from './accounts'
import {
  MayHavePosted,
  NAME,
  NotSent,
  type Own,
  type Payload,
  READ_TTL_S,
  VIDEO,
  words,
} from './make'
import { type MetaApp, MetaError, MetaReconnect } from './meta'
import { viaMeta } from './meta-routes'

/**
 * A job's time with Meta, from its start, inside the connector's limit (`META_SEND_MS`, 230 s;
 * every Graph call stops after a minute, an upload when the publish must start): waits for
 * Instagram to process the files end by 150 s; the call that publishes starts by 165 s, or nothing
 * is sent; reads after it (a Page video's processing, the permalink) start by 170 s. A send can
 * then never outlast the core's limit and post after the core has called its outcome unknown. A
 * video Instagram takes longer than 150 s to process is not posted: try again with a shorter or
 * smaller file.
 */
export const META_WAIT_MS = 150_000
const PUBLISH_BY_MS = 165_000
const READ_BY_MS = 170_000
/** How often a wait asks again. */
const EVERY_MS = 5_000

type Graph = MetaApp['graph']

/** A Page video's `status`, as far as the wait reads it. */
interface VideoStatus {
  video_status?: string
  processing_phase?: { status?: string; error?: { message?: string } }
  publishing_phase?: { status?: string; error?: { message?: string } }
}

/** What one send through Graph needs besides the job. */
export interface MetaSend {
  meta: Pick<MetaApp, 'graph' | 'upload'>
  /** The Page token the brand's account row holds, opened. */
  token: string
  /** A signed read link to one of the post's files, for Meta to fetch. */
  sign: (key: string) => Promise<string>
  /** For tests: the clock and the pause between asks. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Meta refused in a way that proves nothing was posted: a stated error, not Meta's own "unknown"
 * or "try again" (codes 1 and 2, or `is_transient`), and not a lost answer.
 */
export const definite = (err: unknown) =>
  err instanceof MetaReconnect ||
  (err instanceof MetaError &&
    err.code !== null &&
    err.code !== 1 &&
    err.code !== 2 &&
    !err.transient)

/** The post as Graph takes it, checked first: nothing goes to Meta that it would refuse. */
function checked(p: Payload) {
  const name = NAME[p.channel]!
  if (!p.account) throw new NotSent(`Connect ${name} first.`)
  if (p.media.length === 0) throw new NotSent('Add a photo or video.')
  if (p.media.some((f) => 'missing' in f)) {
    throw new NotSent('Upload this post’s photos and videos again: some are only samples.')
  }
  const files = p.media as Own[]
  const photos = files.filter((f) => f.kind === 'photo')
  const videos = files.filter((f) => f.kind === 'video')
  if (photos.length + videos.length !== files.length) {
    throw new NotSent('A file of this post is not a photo or a video.')
  }
  if (videos.some((f) => !VIDEO.includes(f.mime))) {
    throw new NotSent(`${name} takes MP4 or MOV videos only.`)
  }
  if (p.channel === 'ig' && photos.some((f) => f.mime !== 'image/jpeg')) {
    throw new NotSent('Instagram takes JPEG photos only.')
  }
  if (p.format === 'story' && files.length !== 1) {
    throw new NotSent('A story takes one photo or video.')
  }
  if (p.format === 'reel' && (files.length !== 1 || videos.length !== 1)) {
    throw new NotSent('A Reel takes one video.')
  }
  if (p.format === 'carousel') {
    if (files.length > 10) throw new NotSent(`A ${name} post takes up to 10 photos or videos.`)
    if (files.length === 1 && videos.length === 1) {
      throw new NotSent(`${name} posts a single video as a Reel: make it a Reel.`)
    }
    if (p.channel === 'fb' && videos.length > 0) {
      throw new NotSent('A Facebook post takes photos only: put the video in a Reel.')
    }
  }
  return { name, files }
}

/**
 * Posts one Instagram or Facebook job through the Graph API with the brand's Page token: an
 * Instagram photo, carousel, Reel or story (containers, a wait while Instagram processes each
 * video, then `media_publish`), or a Facebook Page photo, several photos as one post, a Reel or a
 * story. Up to the call that makes the post live, a failure means nothing went out (`NotSent`);
 * after it, a lost or unclear answer says to check the account first (`MayHavePosted`). Graph
 * takes no idempotency key: the core uses a person's yes once, so one yes posts once.
 */
export async function sendThroughMeta(s: MetaSend, p: Payload) {
  const { name, files } = checked(p)
  const now = s.now ?? Date.now
  const sleep = s.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const start = now()
  const until = start + META_WAIT_MS
  const late = (ms: number) => now() - start > ms
  const graph: Graph = s.meta.graph
  const token = s.token
  /** Set once the call that publishes has started. */
  let publishingStarted = false
  const tooLate = () =>
    new NotSent(`${name} took too long to take the files. Nothing was posted. Try again.`)
  /** A Graph call; a write before the publish starts only while it can still finish in time. */
  const call = <T>(path: string, params: Record<string, string>, method?: 'GET' | 'POST') => {
    if (method === 'POST' && !publishingStarted && late(PUBLISH_BY_MS)) throw tooLate()
    return graph<T>(path, { ...params, access_token: token }, method)
  }

  /** The call that makes the post live, read as the plan's table says. */
  async function publishing<T>(go: () => Promise<T>, idOf: (answer: T) => unknown) {
    if (late(PUBLISH_BY_MS)) throw tooLate()
    publishingStarted = true
    let answer: T
    try {
      answer = await go()
    } catch (err) {
      if (definite(err)) throw err
      console.error(`meta: ${name} publish call failed`, (err as Error).message)
      throw new MayHavePosted(
        `${name} did not answer. It may have posted it. Check the account before you retry.`,
      )
    }
    const id = idOf(answer)
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new MayHavePosted(
        `${name} answered without a post id. Check the account before you retry.`,
      )
    }
    return String(id)
  }

  /** Waits until `ready` says yes; out of time, nothing was posted. */
  async function waitUntil(ready: () => Promise<boolean>) {
    const slow = () =>
      new NotSent(`${name} took too long to process the video. Nothing was posted. Try again.`)
    for (;;) {
      // No read starts past the wait's end, so none can outlast the core's limit.
      if (now() > until) throw slow()
      if (await ready()) return
      if (now() + EVERY_MS > until) throw slow()
      await sleep(EVERY_MS)
    }
  }

  /** Graph's permalink for a post, or none: the post is out either way. */
  async function linkOf(id: string, field: 'permalink' | 'permalink_url') {
    if (late(READ_BY_MS)) return undefined
    try {
      const got = await call<Record<string, unknown>>(`/${id}`, { fields: field })
      const link = got[field]
      return typeof link === 'string' && /^https:\/\//.test(link) ? link : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Waits until a Page video handed over for publishing is live. One Meta could not process, or
   * one still processing when the time is up, may or may not be live: the person checks.
   */
  async function settled(video: string) {
    const still = () =>
      new MayHavePosted(
        `${name} is still processing the video. It may post it in a few minutes. Check the Page before you retry.`,
      )
    for (;;) {
      if (late(READ_BY_MS)) throw still()
      let status: VideoStatus
      try {
        status =
          (await call<{ status?: VideoStatus }>(`/${video}`, { fields: 'status' })).status ?? {}
      } catch (err) {
        console.error(`meta: ${name} video status unread`, (err as Error).message)
        status = {}
      }
      const error =
        status.processing_phase?.error?.message ?? status.publishing_phase?.error?.message
      if (status.video_status === 'error' || error) {
        // Handed over for publishing, then refused: most likely not live, but only the Page says.
        throw new MayHavePosted(
          `${name} could not process this video${error ? `: ${words(error)}` : '.'} Check the Page before you retry.`,
        )
      }
      // Ready to play is not yet live: where Meta says how the publishing stands, that decides.
      const phase = status.publishing_phase?.status
      if (phase ? phase === 'complete' : status.video_status === 'ready') return
      if (late(READ_BY_MS - EVERY_MS)) throw still()
      await sleep(EVERY_MS)
    }
  }

  const urls = await Promise.all(files.map((f) => s.sign(f.key)))

  try {
    if (p.channel === 'ig') {
      const ig = p.account!
      const source = (i: number): Record<string, string> =>
        files[i]!.kind === 'video' ? { video_url: urls[i]! } : { image_url: urls[i]! }
      const container = async (params: Record<string, string>) =>
        (await call<{ id: string }>(`/${ig}/media`, params, 'POST')).id
      const processed = (id: string) =>
        waitUntil(async () => {
          const { status_code } = await call<{ status_code?: string }>(`/${id}`, {
            fields: 'status_code',
          })
          if (status_code === 'ERROR' || status_code === 'EXPIRED') {
            throw new NotSent(
              'Instagram could not process this video. Check its format and length.',
            )
          }
          return status_code === 'FINISHED'
        })

      let id: string
      if (p.format === 'story') {
        id = await container({ media_type: 'STORIES', ...source(0) })
      } else if (p.format === 'reel') {
        id = await container({
          media_type: 'REELS',
          ...source(0),
          caption: p.text ?? '',
          share_to_feed: String(p.shareToFeed !== false),
        })
      } else if (files.length === 1) {
        id = await container({ ...source(0), caption: p.text ?? '' })
      } else {
        const children: string[] = []
        for (let i = 0; i < files.length; i++) {
          const kind: Record<string, string> =
            files[i]!.kind === 'video' ? { media_type: 'VIDEO' } : {}
          children.push(await container({ ...source(i), ...kind, is_carousel_item: 'true' }))
        }
        for (const [i, child] of children.entries()) {
          if (files[i]!.kind === 'video') await processed(child)
        }
        id = await container({
          media_type: 'CAROUSEL',
          children: children.join(','),
          caption: p.text ?? '',
        })
      }
      // Every container is processed before it publishes, photos too.
      await processed(id)
      const mediaId = await publishing(
        () => call<{ id?: string }>(`/${ig}/media_publish`, { creation_id: id }, 'POST'),
        (a) => a.id,
      )
      const permalink = await linkOf(mediaId, 'permalink')
      return { externalId: mediaId, ...(permalink && { permalink }) }
    }

    const page = p.account!
    const video = files[0]!.kind === 'video'
    let postId: string
    if (p.format === 'story' && !video) {
      // The photo goes up unpublished (nobody sees it), then becomes the story.
      const { id: photo } = await call<{ id: string }>(
        `/${page}/photos`,
        { url: urls[0]!, published: 'false' },
        'POST',
      )
      postId = await publishing(
        () => call<{ post_id?: string }>(`/${page}/photo_stories`, { photo_id: photo }, 'POST'),
        (a) => a.post_id,
      )
    } else if (p.format === 'story' || p.format === 'reel') {
      // A session, Meta fetching the video from our storage, then the finish that publishes.
      const edge = p.format === 'story' ? 'video_stories' : 'video_reels'
      const session = await call<{ video_id: string; upload_url: string }>(
        `/${page}/${edge}`,
        { upload_phase: 'start' },
        'POST',
      )
      if (late(PUBLISH_BY_MS)) throw tooLate()
      // Meta's fetch of the file ends by the time the publish must start.
      await s.meta.upload(session.upload_url, token, urls[0]!, PUBLISH_BY_MS - (now() - start))
      const finish: Record<string, string> =
        p.format === 'story'
          ? { video_id: session.video_id, upload_phase: 'finish' }
          : {
              video_id: session.video_id,
              upload_phase: 'finish',
              video_state: 'PUBLISHED',
              description: p.text ?? '',
            }
      postId = await publishing(
        () => call<{ success?: boolean; post_id?: string }>(`/${page}/${edge}`, finish, 'POST'),
        // A Reel answers only `success`: the video's id names it.
        (a) => (p.format === 'story' ? a.post_id : a.success === true ? session.video_id : null),
      )
      // The finish only hands the video over: Meta processes it, then it goes live.
      await settled(session.video_id)
    } else if (files.length === 1) {
      postId = await publishing(
        () =>
          call<{ id?: string; post_id?: string }>(
            `/${page}/photos`,
            { url: urls[0]!, caption: p.text ?? '' },
            'POST',
          ),
        (a) => a.post_id ?? a.id,
      )
    } else {
      // Several photos: each uploaded unpublished, then one post with them all.
      const ids: string[] = []
      for (const url of urls) {
        ids.push(
          (await call<{ id: string }>(`/${page}/photos`, { url, published: 'false' }, 'POST')).id,
        )
      }
      const attached = Object.fromEntries(
        ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]),
      )
      postId = await publishing(
        () =>
          call<{ id?: string }>(`/${page}/feed`, { message: p.text ?? '', ...attached }, 'POST'),
        (a) => a.id,
      )
    }
    const permalink = p.format === 'story' ? undefined : await linkOf(postId, 'permalink_url')
    return { externalId: postId, ...(permalink && { permalink }) }
  } catch (err) {
    if (err instanceof NotSent || err instanceof MayHavePosted) throw err
    // Before the call that publishes: nothing went out.
    if (err instanceof MetaReconnect) {
      throw new NotSent(`Connect ${name} again on Connections, then retry.`)
    }
    if (err instanceof MetaError) throw new NotSent(`${name}: ${words(err.message)}`)
    console.error(`meta: ${name} send failed before publishing`, (err as Error).message)
    throw new NotSent(`${name} did not answer. Nothing was posted. Try again.`)
  }
}

/**
 * The `social` connector's send for an account linked through our own Meta app: reads the brand's
 * account as the principal the job runs for (the pack's walls apply), checks it is still the one
 * the person approved, opens its Page token, and posts.
 */
export function metaSender(
  core: CoreDeps,
  meta: MetaApp,
  signedReadUrl: ((key: string, ttlSeconds: number) => Promise<string>) | undefined,
) {
  return async (p: Payload, principal: string) => {
    const name = NAME[p.channel]!
    if (!signedReadUrl) throw new NotSent('This server keeps no files.')
    const platform = p.channel === 'ig' ? 'instagram' : 'facebook'
    let rows: Account[]
    try {
      rows = (await call(core, {
        authorization: undefined,
        as: principal,
        internal: true,
        pack: PACK,
        op: 'account.read',
        input: { brand: p.brand, platform },
      })) as Account[]
    } catch (err) {
      throw new NotSent(`Brand Base could not read the ${name} account: ${(err as Error).message}.`)
    }
    const row = rows[0]
    if (!viaMeta(row ?? null) || row!.accountId !== p.account) {
      throw new NotSent(`The ${name} account changed after this was scheduled. Schedule it again.`)
    }
    let token: string
    try {
      token = meta.openToken(row!.tokens, bound(platform, p.brand, row!.accountId))
    } catch {
      // The key changed since the account was linked: only a new sign-in helps.
      throw new NotSent(`Connect ${name} again on Connections, then retry.`)
    }
    return sendThroughMeta({ meta, token, sign: (key) => signedReadUrl(key, READ_TTL_S) }, p)
  }
}
