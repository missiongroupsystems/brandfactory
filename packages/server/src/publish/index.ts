import { type Db } from '../db/client'
import { type DraftRules, textFor } from '../domain/publish'
import { type ChannelKey } from '../domain/posts'
import { type Publisher, PublishError } from '../jobs'
import { type MetaApp, MetaError, MetaReconnect } from '../meta'
import { accountOf, bound, tiktokAccess } from '../routes/accounts'
import { type BlobStore } from '../storage'
import { type TikTokApp, TikTokError, TikTokReconnect } from '../tiktok'
import { itemsOf, type Waiting } from './media'
import { postToFacebook, postToInstagram } from './meta'
import { postToTikTok } from './tiktok'

const NAME: Record<string, string> = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok' }

/** A job's whole budget on the platform, inside the runner's thirty-minute stuck limit. */
export const JOB_BUDGET_MS = 20 * 60 * 1000

/** What the composer keeps in the post's draft that posting reads. */
interface Draft extends DraftRules {
  interactions?: { comments: boolean; duet: boolean; stitch: boolean }
  details?: { comment?: string; collab?: string[] }
  extra?: { igShareToFeed?: boolean; ttSound?: 'own' | 'library' }
}

/** A platform's words, without the signed storage links they sometimes repeat. */
const words = (message: string) => message.replace(/https?:\/\/\S+/g, '(the file)')

/**
 * Posts each job to its platform with the brand's own account. A platform's refusal becomes the
 * job's error in its own words; a dead token says to reconnect; a failure after the post may
 * exist says to check the account first.
 */
export function platformPublisher(deps: {
  db: Db
  storage: BlobStore
  now: () => Date
  meta?: MetaApp
  tiktok?: TikTokApp
  /** For tests: how a job waits. Each job gets its own budget from `JOB_BUDGET_MS`. */
  wait?: (start: number) => Waiting
}): Publisher {
  const waitOf =
    deps.wait ??
    ((start: number): Waiting => ({
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      // TikTok allows 30 status checks a minute per account; Instagram suggests far fewer.
      everyMs: 10_000,
      until: start + JOB_BUDGET_MS,
      clock: () => Date.now(),
    }))

  return {
    async publish({ job, post }) {
      const channel = job.channel as ChannelKey
      const name = NAME[channel]
      if (!name) throw new PublishError(`Brand Base does not post to ${channel} yet.`)
      const draft = (post.draft ?? {}) as Draft
      const text = textFor(post, draft, channel)
      const wait = waitOf(Date.now())
      const reconnect = () => new PublishError(`Reconnect ${name} first.`)

      try {
        if (channel === 'tt') {
          if (!deps.tiktok) throw new PublishError('TikTok is not set up.')
          const access = await tiktokAccess(deps, deps.tiktok, job.brandId)
          const items = await itemsOf(deps.db, deps.storage, job, post.media as never[])
          const id = await postToTikTok(
            deps.tiktok,
            access,
            {
              format: post.format,
              text,
              items,
              privacy: (draft.privacy as 'Everyone' | 'Friends' | 'Only me' | null) ?? null,
              interactions: draft.interactions ?? { comments: false, duet: false, stitch: false },
              promo: {
                on: Boolean(draft.promo?.on),
                own: Boolean(draft.promo?.own),
                paid: Boolean(draft.promo?.paid),
              },
              sound: draft.extra?.ttSound ?? 'own',
            },
            wait,
          )
          return { externalId: id }
        }

        if (!deps.meta) throw new PublishError(`${name} is not set up.`)
        const account = await accountOf(deps.db, job.brandId, 'meta')
        if (!account) throw reconnect()
        let token: string
        try {
          token = deps.meta.openTokens(
            account.tokens,
            bound('meta', account.brandId, account.accountId),
          ).pageToken
        } catch {
          throw reconnect()
        }
        const items = await itemsOf(deps.db, deps.storage, job, post.media as never[])
        const metaPost = {
          format: post.format,
          text,
          items,
          collab: draft.details?.collab ?? [],
          comment: draft.details?.comment ?? '',
          shareToFeed: draft.extra?.igShareToFeed ?? true,
        }
        if (channel === 'ig') {
          const igUserId = (account.details as { igUserId?: string | null }).igUserId
          if (!igUserId) throw reconnect()
          const id = await postToInstagram(deps.meta.graph, { igUserId, token }, metaPost, wait)
          return { externalId: id }
        }
        const id = await postToFacebook(
          deps.meta.graph,
          { pageId: account.accountId, token },
          metaPost,
        )
        return { externalId: id }
      } catch (err) {
        if (err instanceof PublishError) throw new PublishError(words(err.message))
        if (err instanceof MetaReconnect || err instanceof TikTokReconnect) throw reconnect()
        if (err instanceof MetaError || err instanceof TikTokError) {
          throw new PublishError(`${name}: ${words(err.message)}`)
        }
        // Before the post could exist: nothing went out, and the runner says the platform did
        // not answer. After that point the publishers have already said to check the account.
        throw err
      }
    },
  }
}
