import { type Connector } from '@brandfactory/core/src/run'

/**
 * Instagram and Facebook through Make (make.com), until our own Meta app passes review
 * (docs/executing/make-publishing-plan.md). A due job is sent to a Make custom webhook; the Make
 * scenario posts it with Make's own Meta app and answers in the same request. Make holds the
 * tokens; the webhook checks our key (`x-make-apikey`) before the scenario runs.
 */
export interface MakeApp {
  url: string
  secret: string
  /** For tests: how the webhook is called. */
  fetch?: typeof fetch
}

/** What `post.publish_job` sends: one account's job, as the person approved it. */
interface Payload {
  brand: string
  job: string
  post: string
  channel: string
  format: 'reel' | 'carousel' | 'story'
  text: string
  media: File[]
  /** The brand's Instagram account id or Page id; null when none is linked. */
  account: string | null
  shareToFeed: boolean
}

type File = { missing: true } | Own
type Own = { kind: string; mime: string; bytes: number | null; key: string }

/** What the Make scenario gets (the plan's contract). */
export interface MakeRequest {
  v: 1
  postId: string
  job: string
  platform: 'instagram' | 'facebook'
  format: 'photo' | 'carousel' | 'reel'
  accountId: string | null
  pageId: string | null
  caption: string
  shareToFeed: boolean
  media: { type: 'IMAGE' | 'VIDEO'; url: string }[]
}

/** Nothing went out: the core fails the job in these words (`SEND_REFUSED`). */
export class NotSent extends Error {
  readonly sent = false as const
}

/** It may have gone out: the job fails and says to check the account first (`OUTCOME_UNKNOWN`). */
export class MayHavePosted extends Error {
  readonly sent = 'maybe' as const
}

const PLATFORM = { ig: 'instagram', fb: 'facebook' } as const
const NAME: Record<string, string> = {
  ig: 'Instagram',
  fb: 'Facebook',
  tt: 'TikTok',
  yt: 'YouTube',
  li: 'LinkedIn',
}

/** Make answers a Webhook response within 180 s, or `200 Accepted`; a little longer than that. */
export const MAKE_WAIT_MS = 200_000
/** Long enough for Meta to fetch a large video after Make's wait. */
const READ_TTL_S = 2 * 60 * 60
const VIDEO = ['video/mp4', 'video/quicktime']

/** A platform's words, without the signed storage links they sometimes repeat. */
const words = (message: string) => message.replace(/https?:\/\/\S+/g, '(the file)').slice(0, 400)

/** Checks the job against what Make's modules take, and names the request it becomes. */
function requestOf(p: Payload): Omit<MakeRequest, 'media'> & { files: Own[] } {
  const name = NAME[p.channel] ?? p.channel
  if (p.channel !== 'ig' && p.channel !== 'fb') {
    throw new NotSent(`Brand Base does not post to ${name} yet.`)
  }
  if (p.format === 'story') throw new NotSent('Stories are not available yet.')
  if (!p.account) throw new NotSent(`Connect ${name} first.`)
  const files = p.media
  if (files.length === 0) throw new NotSent('Add a photo or video.')
  if (files.some((f) => 'missing' in f)) {
    throw new NotSent('Upload this post’s photos and videos again: some are only samples.')
  }
  const own = files as Own[]
  const photos = own.filter((f) => f.kind === 'photo')
  const videos = own.filter((f) => f.kind === 'video')
  if (photos.length + videos.length !== own.length) {
    throw new NotSent('A file of this post is not a photo or a video.')
  }
  if (videos.some((f) => !VIDEO.includes(f.mime))) {
    throw new NotSent(`${name} takes MP4 or MOV videos only.`)
  }
  let format: MakeRequest['format']
  if (p.format === 'reel') {
    if (own.length !== 1 || videos.length !== 1) throw new NotSent('A Reel takes one video.')
    format = 'reel'
  } else if (p.channel === 'ig') {
    if (photos.some((f) => f.mime !== 'image/jpeg')) {
      throw new NotSent('Instagram takes JPEG photos only.')
    }
    if (own.length > 10) throw new NotSent('An Instagram post takes up to 10 photos or videos.')
    if (own.length === 1 && videos.length === 1) {
      throw new NotSent('Instagram posts a single video as a Reel: make it a Reel.')
    }
    format = own.length === 1 ? 'photo' : 'carousel'
  } else {
    if (videos.length > 0) {
      throw new NotSent('A Facebook post takes photos only: put the video in a Reel.')
    }
    format = own.length === 1 ? 'photo' : 'carousel'
  }
  const platform = PLATFORM[p.channel]
  return {
    v: 1,
    postId: p.post,
    job: p.job,
    platform,
    format,
    accountId: platform === 'instagram' ? p.account : null,
    pageId: platform === 'facebook' ? p.account : null,
    caption: p.text ?? '',
    shareToFeed: p.shareToFeed !== false,
    files: own,
  }
}

/**
 * The `social` connector: posts each Instagram and Facebook job through Make. Any other account,
 * or Instagram and Facebook while Make is not set up, is refused in words: nothing is ever marked
 * posted that did not go out.
 */
export function socialConnector(deps: {
  make?: MakeApp
  signedReadUrl?: (key: string, ttlSeconds: number) => Promise<string>
}): Connector {
  return {
    timeoutMs: MAKE_WAIT_MS + 10_000,
    async send({ payload }) {
      const p = payload as Payload
      const { files, ...body } = requestOf(p)
      const name = NAME[p.channel]!
      if (!deps.make) throw new NotSent(`${name} is not set up.`)
      if (!deps.signedReadUrl) throw new NotSent('This server keeps no files.')
      const sign = deps.signedReadUrl
      const media = await Promise.all(
        files.map(async (f) => ({
          type: f.kind === 'video' ? ('VIDEO' as const) : ('IMAGE' as const),
          url: await sign(f.key, READ_TTL_S),
        })),
      )
      const request: MakeRequest = { ...body, media }
      return callMake(deps.make, request, name)
    },
  }
}

/** One call to the webhook, its answer read as the plan's table says. */
async function callMake(make: MakeApp, request: MakeRequest, name: string) {
  const maybe = (why: string) =>
    new MayHavePosted(`${why} ${name} may have posted it. Check the account before you retry.`)
  let res: Response
  try {
    res = await (make.fetch ?? fetch)(make.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-make-apikey': make.secret },
      body: JSON.stringify(request),
      // The key goes to the configured webhook only, never on to a redirect's address.
      redirect: 'manual',
      signal: AbortSignal.timeout(MAKE_WAIT_MS),
    })
  } catch (err) {
    // A name that does not resolve or a refused connection: the request never left.
    const code = (err as { cause?: { code?: string } }).cause?.code
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
      throw new NotSent('Brand Base could not reach Make.')
    }
    throw maybe('Make did not answer.')
  }
  const text = await res.text().catch(() => '')
  if (res.status >= 300 && res.status < 400) {
    throw new NotSent('Make’s webhook moved. Check MAKE_WEBHOOK_URL.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new NotSent('Make refused Brand Base’s key. Check MAKE_WEBHOOK_SECRET.')
  }
  if (res.status === 404 || res.status === 410) {
    throw new NotSent('Make’s webhook is gone. Check MAKE_WEBHOOK_URL and the scenario.')
  }
  if (res.status === 429) throw new NotSent('Make is busy. Try again in a minute.')
  // A full queue or a payload the webhook's data structure refuses: the scenario did not run.
  if (res.status === 400) throw new NotSent('Make refused the request. Check the scenario in Make.')
  if (!res.ok) throw maybe('The Make scenario stopped.')
  // `Accepted` (not JSON): no answer within Make's 180 s, or a scenario without a Webhook response.
  const answer = parsed(text)
  // Make may still run it, from its queue, after this answer.
  if (!answer) {
    throw new MayHavePosted(
      `Make took too long to answer. ${name} may still post it in a few minutes. Check the account before you retry.`,
    )
  }
  if (answer.ok === false) {
    const why = typeof answer.error === 'string' && answer.error ? answer.error : 'it was refused.'
    throw new NotSent(`${name}: ${words(why)}`)
  }
  // Meta's ids pass 2^53: only a string keeps every digit. A number is kept only while it is exact;
  // the post is out either way.
  const id =
    typeof answer.id === 'string'
      ? answer.id
      : typeof answer.id === 'number' && Number.isSafeInteger(answer.id)
        ? String(answer.id)
        : null
  if (answer.ok !== true) throw maybe('Make answered without a post id.')
  if (id === null || id === '') {
    console.error('make: posted, but the answer has no exact post id', typeof answer.id)
  }
  const permalink =
    typeof answer.permalink === 'string' && /^https:\/\//.test(answer.permalink)
      ? answer.permalink
      : undefined
  return { externalId: id || null, ...(permalink && { permalink }) }
}

type Answer = { ok?: unknown; id?: unknown; permalink?: unknown; error?: unknown }

/** The scenario's JSON answer, or null for anything else. */
function parsed(text: string): Answer | null {
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Answer) : null
  } catch {
    return null
  }
}
