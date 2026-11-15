import { Refused } from '@brandfactory/core/src/errors'
import { call, type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import { bound, PACK, readAccount, type Who } from './accounts'
import { type MetaApp, MetaError, MetaReconnect } from './meta'
import { viaMeta } from './meta-routes'

/** Where one collaborator's invite stands, as Instagram says. */
export type InviteStatus = 'pending' | 'accepted' | 'declined'

const STATUS: Record<string, InviteStatus> = {
  pending: 'pending',
  accepted: 'accepted',
  declined: 'declined',
}

/**
 * The collaborators of a post that went out on Instagram, each with where its invite stands
 * (`GET /{media}/collaborators`): Instagram sends each invite when the post goes out, and the
 * account's name shows on the post only once it accepts. Read live each time and never stored.
 * The post's media id comes from its own live job (`post.ig_media`), read as the person, so only
 * a post of a brand they reach is asked about. A post not live on Instagram has none.
 */
export function metaCollabRoutes(core: CoreDeps, meta: MetaApp | undefined) {
  const who = (c: Context): Who => ({ authorization: c.req.header('authorization') })

  return new Hono().get('/brands/:brand/posts/:post/collaborators', async (c) => {
    if (!meta) throw new Refused(503, 'PLATFORM_OFF', 'Facebook and Instagram are not set up')
    const brand = c.req.param('brand')
    const post = c.req.param('post')
    const live = (await call(core, {
      authorization: who(c).authorization,
      pack: PACK,
      op: 'post.ig_media',
      input: { brand, id: post },
      internal: true,
    })) as { mediaId: string }[]
    c.header('cache-control', 'no-store')
    if (!live[0]) return c.json({ collaborators: [] })
    const account = await readAccount(core, who(c), brand, 'instagram')
    if (!viaMeta(account)) {
      throw new Refused(409, 'META_NOT_LINKED', 'connect the account on Connections first')
    }
    let token: string
    try {
      token = meta.openToken(account.tokens, bound('instagram', brand, account.accountId))
    } catch {
      throw new Refused(409, 'META_RECONNECT', 'Facebook needs connecting again')
    }
    let got: { data?: { username?: unknown; invite_status?: unknown }[] }
    try {
      got = await meta.graph(`/${live[0].mediaId}/collaborators`, {
        fields: 'id,username,invite_status',
        access_token: token,
      })
    } catch (err) {
      if (err instanceof MetaReconnect) {
        throw new Refused(409, 'META_RECONNECT', 'Facebook needs connecting again')
      }
      if (err instanceof MetaError) throw new Refused(502, 'PLATFORM', `Instagram: ${err.message}`)
      console.error('meta collaborators', (err as Error).message)
      throw new Refused(502, 'PLATFORM', 'Instagram did not answer')
    }
    const collaborators = (got.data ?? []).flatMap((d) => {
      const status = STATUS[String(d.invite_status ?? '').toLowerCase()]
      return typeof d.username === 'string' && status ? [{ handle: `@${d.username}`, status }] : []
    })
    return c.json({ collaborators })
  })
}
