import { Refused } from '@brandfactory/core/src/errors'
import { call, type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import { bound, PACK, readAccount, type Who } from './accounts'
import { type MetaApp, MetaError, MetaReconnect } from './meta'
import { handle, USERNAME } from './meta-post'
import { viaMeta } from './meta-routes'

/**
 * Whether Instagram shows an account to the API, as Business Discovery finds it: `confirmed`
 * (a business or creator account, which is public), `unconfirmed` (Meta cannot find the user:
 * a personal account, public or private, or a misspelled name) or `unknown` (Meta did not say:
 * a missing permission, a rate limit, an outage).
 */
export type AccountCheck = 'confirmed' | 'unconfirmed' | 'unknown'

/** Meta's code for "Cannot find User" on Business Discovery (subcode 2207013). */
const NOT_FOUND = 110

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

  /** The brand's Instagram account linked through the Meta app, with its token opened. */
  const linked = async (c: Context, brand: string) => {
    const account = await readAccount(core, who(c), brand, 'instagram')
    if (!viaMeta(account)) {
      throw new Refused(409, 'META_NOT_LINKED', 'connect the account on Connections first')
    }
    try {
      return {
        account,
        token: meta!.openToken(account.tokens, bound('instagram', brand, account.accountId)),
      }
    } catch {
      throw new Refused(409, 'META_RECONNECT', 'Facebook needs connecting again')
    }
  }

  return new Hono()
    .get('/brands/:brand/instagram/accounts/:handle', async (c) => {
      // Whether a tag or an invite can reach this account: a hint the post page shows before the
      // post goes out, never a block. Read live, stored nowhere.
      if (!meta) throw new Refused(503, 'PLATFORM_OFF', 'Facebook and Instagram are not set up')
      const brand = c.req.param('brand')
      const name = handle(c.req.param('handle'))
      if (!USERNAME.test(name)) throw new Refused(400, 'VALIDATION', 'send an Instagram username')
      const { account, token } = await linked(c, brand)
      c.header('cache-control', 'no-store')
      let status: AccountCheck
      try {
        const got = await meta.graph<{ business_discovery?: { username?: unknown } }>(
          `/${account.accountId}`,
          { fields: `business_discovery.username(${name}){username}`, access_token: token },
        )
        status = typeof got.business_discovery?.username === 'string' ? 'confirmed' : 'unknown'
      } catch (err) {
        if (err instanceof MetaError && err.code === NOT_FOUND) {
          status = 'unconfirmed'
        } else {
          // A missing permission or an outage would warn on every name: the page says nothing.
          console.error('meta account check', (err as Error).message)
          status = 'unknown'
        }
      }
      return c.json({ handle: `@${name}`, status })
    })
    .get('/brands/:brand/posts/:post/collaborators', async (c) => {
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
      const { token } = await linked(c, brand)
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
        if (err instanceof MetaError)
          throw new Refused(502, 'PLATFORM', `Instagram: ${err.message}`)
        console.error('meta collaborators', (err as Error).message)
        throw new Refused(502, 'PLATFORM', 'Instagram did not answer')
      }
      const collaborators = (got.data ?? []).flatMap((d) => {
        const status = STATUS[String(d.invite_status ?? '').toLowerCase()]
        return typeof d.username === 'string' && status
          ? [{ handle: `@${d.username}`, status }]
          : []
      })
      return c.json({ collaborators })
    })
}
