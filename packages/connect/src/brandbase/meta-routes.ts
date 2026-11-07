import { Refused } from '@brandfactory/core/src/errors'
import { authenticate, call, type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import {
  type Account,
  bound,
  forgetAccount,
  linkAccount,
  PACK,
  readAccount,
  type Who,
} from './accounts'
import { type MetaApp, MetaError, MetaReconnect } from './meta'
import { type MetaHooks } from './meta-webhooks'

function appOf(app: MetaApp | undefined): MetaApp {
  if (!app) throw new Refused(503, 'PLATFORM_OFF', 'Facebook and Instagram are not set up')
  return app
}

/** A call to Meta; a dead token says to reconnect, a refusal keeps Meta's words. */
async function ask<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (err instanceof MetaReconnect) {
      throw new Refused(409, 'META_RECONNECT', 'Facebook needs connecting again')
    }
    if (err instanceof MetaError) throw new Refused(502, 'PLATFORM', `Facebook: ${err.message}`)
    console.error(err)
    throw new Refused(502, 'PLATFORM', 'Facebook did not answer')
  }
}

/** A JSON body whose named fields are all strings. */
async function strings<K extends string>(c: Context, ...keys: K[]): Promise<Record<K, string>> {
  const value = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!value || keys.some((k) => typeof value[k] !== 'string' || value[k] === '')) {
    throw new Refused(400, 'VALIDATION', `send ${keys.join(' and ')}`)
  }
  return value as Record<K, string>
}

/** True for an account linked through our own Meta app, not one Make posts to. */
export const viaMeta = (account: Account | null): account is Account =>
  account?.details.via === 'meta'

/**
 * A brand's Facebook Page and its Instagram business account through our own Meta app (Facebook
 * Login for Business, docs/executing/meta-direct-plan.md). The browser comes back to the web app's
 * `/connect/meta`, which posts the code here with its session; the sealed state names the person
 * who started. The answer is the person's Pages and a sealed choice; `/meta/select` links the one
 * picked as the brand's `facebook` row and its Instagram account as the `instagram` row, each with
 * the Page token sealed to its row, and turns the Page's webhooks on. Linking and forgetting are
 * the pack's account moves run as the person: only an owner or admin of a company on the
 * operator's list (`account.make_managed`). The Page's webhooks turn on only when a delivery could
 * be kept: Meta does not send again what was answered with a 200, and it unsubscribes a Page after
 * an hour of errors.
 */
export function metaRoutes(core: CoreDeps, meta: MetaApp | undefined, hooks?: MetaHooks) {
  const now = () => core.now().getTime()
  const who = (c: Context): Who => ({ authorization: c.req.header('authorization') })
  const person = (c: Context) => authenticate(core.auth, c.req.header('authorization'))
  /** One of the pack's internal moves, run as the person. */
  const metaMove = (c: Context, op: string, input: Record<string, unknown>) =>
    call(core, { authorization: who(c).authorization, pack: PACK, op, input, internal: true })
  /**
   * Whether a delivery for this Page could be kept: the signature can be checked, and an empty
   * delivery passes as the webhook's principal. `no` is a definite no; `unknown` is a failure that
   * says nothing about the setup, such as a lost database connection.
   */
  const canKeepMessages = async (brand: string, account: string) => {
    if (!hooks?.appSecret || !hooks.as) {
      console.error('meta: META_APP_SECRET or META_WEBHOOK_AS is not set', brand)
      return 'no'
    }
    try {
      await call(core, {
        authorization: undefined,
        as: hooks.as,
        internal: true,
        pack: PACK,
        op: 'inbox.meta_receive',
        input: { platform: 'facebook', account, items: [], removed: [] },
      })
      return 'yes'
    } catch (err) {
      console.error('meta: could not check the Page’s messages', brand, (err as Error).message)
      return err instanceof Refused && err.status < 500 ? 'no' : 'unknown'
    }
  }
  const invalid = () =>
    new Refused(400, 'META_STATE', 'this Facebook link is not valid. Start again.')

  return (
    new Hono()
      // The start of a sign-in for a brand the person reaches (the account read refuses others).
      .post('/brands/:brand/meta/connect', async (c) => {
        const app = appOf(meta)
        const brand = c.req.param('brand')
        // Who may link is checked here, before Facebook's dialog, and again when linking.
        await metaMove(c, 'account.meta_check', { brand, platform: 'facebook' })
        const state = app.sealState({ userId: await person(c), brandId: brand }, now())
        return c.json({ url: app.authorizeUrl(state) })
      })

      .post('/meta/callback', async (c) => {
        const app = appOf(meta)
        const { code, state } = await strings(c, 'code', 'state')
        const was = app.openState(state, now())
        if (!was || was.userId !== (await person(c))) throw invalid()
        // The person may have lost the brand in the ten minutes.
        await readAccount(core, who(c), was.brandId, 'facebook')
        const pages = await ask(() => app.pagesFor(code))
        if (pages.length === 0) {
          throw new Refused(
            400,
            'META_NO_PAGES',
            'no Facebook Page came back. Tick the brand’s Page on Facebook’s screen.',
          )
        }
        return c.json({
          brandId: was.brandId,
          choice: app.sealChoice({ ...was, pages }, now()),
          pages: pages.map((p) => ({ id: p.id, name: p.name, igUsername: p.igUsername })),
        })
      })

      .post('/meta/select', async (c) => {
        const app = appOf(meta)
        const { choice, pageId } = await strings(c, 'choice', 'pageId')
        const offered = app.openChoice(choice, now())
        if (!offered || offered.userId !== (await person(c))) throw invalid()
        const page = offered.pages.find((p) => p.id === pageId)
        if (!page) throw new Refused(404, 'NOT_FOUND', 'page not found')
        const brand = offered.brandId
        const oldPage = await readAccount(core, who(c), brand, 'facebook')
        const before = await readAccount(core, who(c), brand, 'instagram')
        // The Page first: another brand's Page is refused before anything is kept.
        await linkAccount(core, who(c), brand, 'facebook', {
          accountId: page.id,
          username: page.name,
          tokens: app.sealToken(page.token, bound('facebook', brand, page.id)),
          details: { via: 'meta', igUserId: page.igUserId },
        })
        // The Instagram account of a Page linked before goes first: its token is that Page's, and
        // a refusal of the new one below must not leave it behind.
        if (viaMeta(before) && before.accountId !== page.igUserId) {
          await forgetAccount(core, who(c), brand, 'instagram', before.accountId)
        }
        // A Page linked before stops sending its webhooks here, and its comments and DMs go.
        if (viaMeta(oldPage) && oldPage.accountId !== page.id) {
          await metaMove(c, 'inbox.meta_forget', { brand, platform: 'facebook' })
          try {
            const old = app.openToken(oldPage.tokens, bound('facebook', brand, oldPage.accountId))
            await app.unsubscribe(oldPage.accountId, old)
          } catch (err) {
            console.error(
              'meta: the old Page’s webhooks did not turn off',
              brand,
              (err as Error).message,
            )
          }
        }
        if (page.igUserId) {
          await linkAccount(core, who(c), brand, 'instagram', {
            accountId: page.igUserId,
            username: page.igUsername ?? page.name,
            tokens: app.sealToken(page.token, bound('instagram', brand, page.igUserId)),
            details: { via: 'meta', pageId: page.id },
          })
        }
        // Linked either way: without the webhooks only the inbox misses this Page.
        const keeps = await canKeepMessages(brand, page.id)
        let webhooks = keeps === 'yes'
        try {
          if (webhooks) await app.subscribe(page.id, page.token)
          // A Page subscribed before must stop too: what Meta delivers now would be lost.
          else if (keeps === 'no') await app.unsubscribe(page.id, page.token)
        } catch (err) {
          webhooks = false
          console.error('meta: the Page webhooks did not change', brand, (err as Error).message)
        }
        return c.json({
          brandId: brand,
          page: page.name,
          igUsername: page.igUserId ? page.igUsername : null,
          webhooks,
        })
      })

      // Forgets the brand's Page and Instagram account linked through Meta, then turns the Page's
      // webhooks off with the token read before. The forget comes first: it is the move that
      // checks who may do this, so nobody else reaches Meta. Meta revokes only a person's whole
      // grant, which would cut every Page they linked for other brands too, so the grant stays;
      // once our only copy of the token is gone, nothing uses it. An account linked through Make
      // is left to its own route.
      .delete('/brands/:brand/meta', async (c) => {
        const app = meta
        const brand = c.req.param('brand')
        const page = await readAccount(core, who(c), brand, 'facebook')
        const ig = await readAccount(core, who(c), brand, 'instagram')
        if (viaMeta(page)) await forgetAccount(core, who(c), brand, 'facebook', page.accountId)
        if (viaMeta(ig)) await forgetAccount(core, who(c), brand, 'instagram', ig.accountId)
        // The comments and DMs that came through the Page go with it, and their senders' ids.
        if (viaMeta(page) || viaMeta(ig)) {
          await metaMove(c, 'inbox.meta_forget', { brand, platform: 'facebook' })
        }
        let unsubscribed = false
        if (app && viaMeta(page)) {
          try {
            const token = app.openToken(page.tokens, bound('facebook', brand, page.accountId))
            await app.unsubscribe(page.accountId, token)
            unsubscribed = true
          } catch (err) {
            console.error('meta: the Page webhooks did not turn off', brand, (err as Error).message)
          }
        }
        return c.json({ unsubscribed })
      })
  )
}
