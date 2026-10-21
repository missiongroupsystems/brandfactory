import { PublishError } from '../jobs'
import { type MetaApp, MetaError, MetaReconnect } from '../meta'
import { type Item, mayHavePosted, type Waiting, waitFor } from './media'

export interface MetaPost {
  format: 'reel' | 'carousel' | 'story'
  text: string
  items: Item[]
  /** Instagram usernames invited as collaborators (feed and reels), without the "@". */
  collab: string[]
  /** Posted as the first comment once the post is live. */
  comment: string
  /** A reel also on the main grid; Instagram's default is yes. */
  shareToFeed: boolean
}

type Graph = MetaApp['graph']

/**
 * A refusal Meta stated (an error with a code that means "no") proves nothing was posted; a lost
 * answer, or Meta's own "unknown" and "unavailable" errors (codes 1 and 2), does not.
 */
const definite = (err: unknown) =>
  err instanceof PublishError ||
  err instanceof MetaReconnect ||
  (err instanceof MetaError && err.code !== null && err.code !== 1 && err.code !== 2)

/**
 * The call that makes the post live: after it, a failure may hide a post that went out, and so
 * does an answer with no id (one cut off after Meta said yes).
 */
async function publishing<T extends { id?: string }>(
  platform: string,
  call: () => Promise<T>,
): Promise<T> {
  let answer: T
  try {
    answer = await call()
  } catch (err) {
    if (definite(err)) throw err
    console.error(`${platform} publish call failed`, err)
    throw mayHavePosted(platform)
  }
  if (!answer.id) throw mayHavePosted(platform)
  return answer
}

/** The first comment: the post is already live, so a refusal here is logged, not a failure. */
async function firstComment(graph: Graph, token: string, objectId: string, comment: string) {
  if (!comment.trim()) return
  try {
    await graph(`/${objectId}/comments`, { message: comment, access_token: token }, 'POST')
  } catch (err) {
    console.error('first comment failed', objectId, err)
  }
}

/**
 * Instagram's content publishing: a container per photo or video, a carousel container over
 * several, a wait until Instagram has processed each video, then `media_publish`. A story posts
 * each frame on its own. Photos must be JPEG.
 */
export async function postToInstagram(
  graph: Graph,
  account: { igUserId: string; token: string },
  post: MetaPost,
  wait: Waiting,
): Promise<string> {
  const { igUserId, token } = account
  if (post.items.length === 0) throw new PublishError('Add a photo or video.')
  if (post.items.some((i) => i.kind === 'photo' && i.mime !== 'image/jpeg')) {
    throw new PublishError(
      'Instagram takes JPEG photos only. Save the photos as JPEG and add them again.',
    )
  }
  const source = (i: Item): Record<string, string> =>
    i.kind === 'photo' ? { image_url: i.url } : { video_url: i.url }
  const collab = post.collab.map((c) => c.replace(/^@/, '')).filter(Boolean)
  const collaborators: Record<string, string> =
    collab.length > 0 ? { collaborators: JSON.stringify(collab.slice(0, 3)) } : {}

  async function container(params: Record<string, string>) {
    // Before anything is published: out of time here means nothing went out.
    if (wait.clock() >= wait.until) {
      throw new PublishError('Instagram took too long. Nothing was posted; try again.')
    }
    const { id } = await graph<{ id: string }>(
      `/${igUserId}/media`,
      { ...params, access_token: token },
      'POST',
    )
    return id
  }
  async function ready(id: string) {
    await waitFor(
      async () => {
        const { status_code } = await graph<{ status_code?: string }>(`/${id}`, {
          fields: 'status_code',
          access_token: token,
        })
        if (status_code === 'ERROR' || status_code === 'EXPIRED') {
          throw new PublishError(
            'Instagram could not process this video. Check its format and length.',
          )
        }
        return status_code === 'FINISHED' || status_code === 'PUBLISHED'
      },
      wait,
      'Instagram',
    )
  }
  async function publish(id: string) {
    await ready(id)
    const { id: mediaId } = await publishing('Instagram', () =>
      graph<{ id: string }>(
        `/${igUserId}/media_publish`,
        { creation_id: id, access_token: token },
        'POST',
      ),
    )
    return mediaId
  }

  if (post.format === 'story') {
    const ids: string[] = []
    for (const item of post.items) {
      try {
        ids.push(await publish(await container({ media_type: 'STORIES', ...source(item) })))
      } catch (err) {
        // Frames already out stay out: a retry would post them again.
        if (ids.length === 0) throw err
        // Its own advice does not hold once a frame is out: only the advice below does.
        const said = (err instanceof Error ? err.message : 'it stopped')
          .replace(/ Check the account before you retry\.$/, '')
          .replace(/ Nothing was posted; try again\.$/, '')
        const why = /[.!?]$/.test(said) ? said : `${said}.`
        throw new PublishError(
          `Instagram posted ${ids.length} of ${post.items.length} story frames, then stopped: ` +
            `${why} Check the account before you retry.`,
        )
      }
    }
    return ids.join(',')
  }

  let id: string
  if (post.items.length === 1) {
    const [item] = post.items as [Item]
    id = await container({
      ...source(item),
      ...(item.kind === 'video'
        ? { media_type: 'REELS', share_to_feed: String(post.shareToFeed) }
        : {}),
      caption: post.text,
      ...collaborators,
    })
  } else {
    const children: string[] = []
    for (const item of post.items) {
      const child = await container({
        ...source(item),
        ...(item.kind === 'video' ? { media_type: 'VIDEO' } : {}),
        is_carousel_item: 'true',
      })
      if (item.kind === 'video') await ready(child)
      children.push(child)
    }
    id = await container({
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption: post.text,
      ...collaborators,
    })
  }
  const mediaId = await publish(id)
  await firstComment(graph, token, mediaId, post.comment)
  return mediaId
}

/**
 * A Facebook Page post: one photo, several photos as one post, or one video. Page stories and a
 * carousel with a video are refused for now.
 */
export async function postToFacebook(
  graph: Graph,
  account: { pageId: string; token: string },
  post: MetaPost,
): Promise<string> {
  const { pageId, token } = account
  if (post.format === 'story') {
    throw new PublishError(
      'Facebook Page stories are not supported yet. Post the story to Instagram.',
    )
  }
  if (post.items.length === 0) throw new PublishError('Add a photo or video.')
  const videos = post.items.filter((i) => i.kind === 'video')
  if (videos.length > 0 && post.items.length > 1) {
    throw new PublishError('Facebook takes a carousel of photos only. Post the video on its own.')
  }

  let postId: string
  if (videos.length === 1) {
    const { id } = await publishing('Facebook', () =>
      graph<{ id: string }>(
        `/${pageId}/videos`,
        { file_url: videos[0]!.url, description: post.text, access_token: token },
        'POST',
      ),
    )
    postId = id
  } else if (post.items.length === 1) {
    const photo = await publishing('Facebook', () =>
      graph<{ id: string; post_id?: string }>(
        `/${pageId}/photos`,
        { url: post.items[0]!.url, caption: post.text, access_token: token },
        'POST',
      ),
    )
    postId = photo.post_id ?? photo.id
  } else {
    // Several photos: each uploaded unpublished (nobody sees them), then one post with them all.
    const ids: string[] = []
    for (const item of post.items) {
      const { id } = await graph<{ id: string }>(
        `/${pageId}/photos`,
        { url: item.url, published: 'false', access_token: token },
        'POST',
      )
      ids.push(id)
    }
    const attached = Object.fromEntries(
      ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]),
    )
    const { id } = await publishing('Facebook', () =>
      graph<{ id: string }>(
        `/${pageId}/feed`,
        { message: post.text, ...attached, access_token: token },
        'POST',
      ),
    )
    postId = id
  }
  await firstComment(graph, token, postId, post.comment)
  return postId
}
