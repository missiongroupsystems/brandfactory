import { and, eq, inArray } from 'drizzle-orm'
import { type Conn } from '../db/client'
import { media } from '../db/schema'
import { PublishError, type JobRow } from '../jobs'
import { type BlobStore } from '../storage'

/** How long a platform has to fetch a file: Instagram's video processing can take a while. */
const READ_TTL_S = 2 * 60 * 60

export interface Item {
  kind: 'photo' | 'video'
  mime: string
  bytes: number | null
  /** A signed storage URL the platform fetches. */
  url: string
}

/**
 * The post's media, in order, as files the platforms can fetch. Only uploaded files can go: the
 * demo's sample pictures have no stored file.
 */
export async function itemsOf(
  db: Conn,
  storage: BlobStore,
  job: JobRow,
  list: { mediaId?: string; kind?: string }[],
): Promise<Item[]> {
  const ids = list.map((m) => m.mediaId)
  if (ids.some((id) => !id)) {
    throw new PublishError('Upload this post’s photos and videos again: some are only samples.')
  }
  if (ids.length === 0) return []
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.brandId, job.brandId), inArray(media.id, ids as string[])))
  return Promise.all(
    ids.map(async (id) => {
      const row = rows.find((r) => r.id === id)
      if (!row || row.kind === 'file') {
        throw new PublishError('A photo or video of this post is gone.')
      }
      return {
        kind: row.kind,
        mime: row.mime,
        bytes: row.bytes,
        url: await storage.signedReadUrl(row.storageKey, READ_TTL_S),
      }
    }),
  )
}

/** How a job waits on a platform: one budget for the whole job, however many waits it has. */
export interface Waiting {
  sleep: (ms: number) => Promise<void>
  everyMs: number
  /** Epoch milliseconds by which the job must be done. */
  until: number
  clock: () => number
}

/** Waits for a platform to finish: `check` says done (true) or not yet (false), or throws. */
export async function waitFor(check: () => Promise<boolean>, wait: Waiting, what: string) {
  for (;;) {
    if (await check()) return
    if (wait.clock() + wait.everyMs > wait.until) {
      throw new PublishError(`${what} took too long. Check the account before you retry.`)
    }
    await wait.sleep(wait.everyMs)
  }
}

/**
 * The words for a failure after the post may already exist on the platform: a retry would post
 * it twice, so the person checks first.
 */
export const mayHavePosted = (platform: string, why?: string) =>
  new PublishError(
    `${platform} may have posted it${why ? ` (${why})` : ''}. Check the account before you retry.`,
  )
