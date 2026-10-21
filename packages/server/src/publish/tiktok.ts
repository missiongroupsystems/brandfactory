import { PublishError } from '../jobs'
import { type TikTokApp } from '../tiktok'
import { type Item, mayHavePosted, type Waiting, waitFor } from './media'

export interface TikTokPost {
  format: 'reel' | 'carousel' | 'story'
  text: string
  items: Item[]
  /** The composer's answers. */
  privacy: 'Everyone' | 'Friends' | 'Only me' | null
  interactions: { comments: boolean; duet: boolean; stitch: boolean }
  promo: { on: boolean; own: boolean; paid: boolean }
  /** `library`: the post goes to the creator's inbox, where they add a sound in TikTok. */
  sound: 'own' | 'library'
}

const PRIVACY = {
  Everyone: 'PUBLIC_TO_EVERYONE',
  Friends: 'MUTUAL_FOLLOW_FRIENDS',
  'Only me': 'SELF_ONLY',
} as const
const LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me',
}
/** The video types TikTok takes. */
const TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/**
 * The upload in chunks of 10 MB, the last one taking the rest (under 20 MB); a video under 10 MB
 * goes whole (TikTok wants a file under 5 MB whole, and takes one chunk up to 64 MB).
 */
const CHUNK = 10 * 1024 * 1024

/**
 * At most two uploads at once: the server's memory is small and each holds a chunk. A finishing
 * upload hands its place straight to the next in line, so none slips in between.
 */
let uploading = 0
const queue: (() => void)[] = []
async function oneOfTwo<T>(run: () => Promise<T>): Promise<T> {
  if (uploading < 2) uploading++
  else await new Promise<void>((go) => queue.push(go))
  try {
    return await run()
  } finally {
    const next = queue.shift()
    if (next) next()
    else uploading--
  }
}

/** Reads a stream in pieces of exactly the sizes asked for: about two chunks held at most. */
function exactReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  let pending: Uint8Array[] = []
  let have = 0
  return async (size: number) => {
    while (have < size) {
      const { done, value } = await reader.read()
      if (done) throw new PublishError('The video in storage is shorter than expected. Try again.')
      pending.push(value)
      have += value.byteLength
    }
    const out = new Uint8Array(size)
    let filled = 0
    while (filled < size) {
      const head = pending[0]!
      const take = Math.min(head.byteLength, size - filled)
      out.set(head.subarray(0, take), filled)
      filled += take
      pending =
        take === head.byteLength ? pending.slice(1) : [head.subarray(take), ...pending.slice(1)]
    }
    have -= size
    return out
  }
}

/**
 * TikTok's Content Posting API: one video, sent from our storage as a file upload (a pull from a
 * URL needs a domain TikTok has verified). Direct Post with the answers the composer took, or the
 * creator's inbox when the sound is picked in TikTok. The privacy must be one `creator_info`
 * offers: until the app passes TikTok's audit, that is "Only me" alone. Once every chunk is up,
 * TikTok goes on without us, so a failure after that says the post may be out.
 */
export async function postToTikTok(
  tiktok: TikTokApp,
  access: string,
  post: TikTokPost,
  wait: Waiting,
): Promise<string> {
  if (post.format !== 'reel' || post.items.length !== 1 || post.items[0]!.kind !== 'video') {
    throw new PublishError('TikTok takes one video. Photo posts are not supported yet.')
  }
  const video = post.items[0]!
  if (!TYPES.includes(video.mime)) {
    throw new PublishError('TikTok takes MP4, MOV or WebM videos. Export the video as MP4.')
  }
  const inbox = post.sound === 'library'

  let postInfo: Record<string, unknown> | undefined
  if (!inbox) {
    if (!post.privacy) throw new PublishError('Choose who can watch on TikTok.')
    const creator = await tiktok.api<{
      privacy_level_options: string[]
      comment_disabled?: boolean
      duet_disabled?: boolean
      stitch_disabled?: boolean
    }>(access, '/post/publish/creator_info/query/')
    const level = PRIVACY[post.privacy]
    if (!creator.privacy_level_options.includes(level)) {
      const allowed = creator.privacy_level_options.map((o) => LABEL[o] ?? o).join(', ')
      throw new PublishError(
        `TikTok lets this account post to ${allowed || 'no one'} for now, not ${post.privacy}. ` +
          'Until the app passes TikTok’s audit, posts can be “Only me”.',
      )
    }
    postInfo = {
      title: post.text,
      privacy_level: level,
      // The creator's own settings win: a feature they turned off stays off.
      disable_comment: !post.interactions.comments || Boolean(creator.comment_disabled),
      disable_duet: !post.interactions.duet || Boolean(creator.duet_disabled),
      disable_stitch: !post.interactions.stitch || Boolean(creator.stitch_disabled),
      brand_content_toggle: post.promo.on && post.promo.paid,
      brand_organic_toggle: post.promo.on && post.promo.own,
    }
  }

  // The job's budget covers the wait for an upload place and the upload itself.
  const left = () => Math.floor(wait.until - wait.clock())
  const publishId = await oneOfTwo(async () => {
    if (left() <= 0) {
      throw new PublishError('TikTok was busy with other uploads. Nothing was posted; try again.')
    }
    // The bytes stream from our storage to TikTok one chunk at a time.
    const file = await tiktok.fetch(video.url, { signal: AbortSignal.timeout(Math.max(1, left())) })
    if (!file.ok || !file.body) {
      throw new PublishError('The video could not be read from storage. Try again.')
    }
    const size = Number(file.headers.get('content-length')) || video.bytes || 0
    if (size <= 0) throw new PublishError('The video’s size is unknown. Upload it again.')
    const chunkSize = size < CHUNK ? size : CHUNK
    const chunks = Math.floor(size / chunkSize)

    const init = await tiktok.api<{ publish_id: string; upload_url: string }>(
      access,
      inbox ? '/post/publish/inbox/video/init/' : '/post/publish/video/init/',
      {
        ...(postInfo && { post_info: postInfo }),
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: size,
          chunk_size: chunkSize,
          total_chunk_count: chunks,
        },
      },
    )

    const read = exactReader(file.body)
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize
      const end = i === chunks - 1 ? size : start + chunkSize
      const body = await read(end - start)
      const last = i === chunks - 1
      let res: Response
      try {
        res = await tiktok.fetch(init.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': video.mime,
            'Content-Range': `bytes ${start}-${end - 1}/${size}`,
          },
          body,
          signal: AbortSignal.timeout(Math.max(1, Math.min(5 * 60 * 1000, left()))),
        })
      } catch (err) {
        // A lost answer to the last chunk: TikTok may have the whole file and post it.
        if (!last) throw err
        console.error('tiktok last chunk lost', init.publish_id, err)
        throw mayHavePosted('TikTok')
      }
      // A server error on the last chunk may come after TikTok has the whole file.
      if (last && res.status >= 500) throw mayHavePosted('TikTok', `HTTP ${res.status}`)
      if (!res.ok) throw new PublishError(`TikTok refused the upload (HTTP ${res.status}).`)
    }
    return init.publish_id
  })

  try {
    await waitFor(
      async () => {
        const status = await tiktok.api<{ status: string; fail_reason?: string }>(
          access,
          '/post/publish/status/fetch/',
          { publish_id: publishId },
        )
        if (status.status === 'FAILED') {
          throw new PublishError(
            `TikTok did not post it: ${status.fail_reason ?? 'no reason given'}.`,
          )
        }
        // An inbox draft the creator posts quickly comes back as published.
        return (
          status.status === 'PUBLISH_COMPLETE' || (inbox && status.status === 'SEND_TO_USER_INBOX')
        )
      },
      wait,
      'TikTok',
    )
  } catch (err) {
    // TikTok said no, or the time ran out: the words already say so.
    if (err instanceof PublishError) throw err
    console.error('tiktok status check failed', publishId, err)
    throw mayHavePosted('TikTok')
  }
  return publishId
}
