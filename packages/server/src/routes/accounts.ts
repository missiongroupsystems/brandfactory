import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { requireBrand } from '../authz'
import { type AppEnv } from '../context'
import { type Conn } from '../db/client'
import { brandAccounts } from '../db/schema'
import { conflict, HttpError, invalid, notFound } from '../errors'
import { body } from '../http'
import { type MetaApp, MetaError, MetaReconnect } from '../meta'
import { type TikTokApp, TikTokError, TikTokReconnect, type TikTokTokens } from '../tiktok'
import { type BrandEnv } from './shared'

type Platform = 'meta' | 'tiktok'
const NAME: Record<Platform, string> = { meta: 'Facebook', tiktok: 'TikTok' }

/** What a brand's tokens are sealed to: they open only in that brand's row for that account. */
export const bound = (platform: Platform, brandId: string, accountId: string) =>
  `${platform}:${brandId}:${accountId}`

/** True for Postgres's unique violation, which drizzle passes on as the error's cause. */
const uniqueViolation = (err: unknown) =>
  (err as { cause?: { code?: string } })?.cause?.code === '23505'

const taken = (platform: Platform) =>
  conflict(`this ${NAME[platform]} account belongs to another brand`, 'ACCOUNT_TAKEN')

export const reconnect = (platform: Platform) =>
  conflict(`${NAME[platform]} needs connecting again`, 'RECONNECT')

function appOf<T>(app: T | undefined, platform: Platform): T {
  if (!app) throw new HttpError(503, 'PLATFORM_OFF', `${NAME[platform]} is not set up`)
  return app
}

/** A call to a platform; a dead token says to reconnect, a refusal keeps the platform's words. */
async function ask<T>(platform: Platform, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (err instanceof MetaReconnect || err instanceof TikTokReconnect) throw reconnect(platform)
    if (err instanceof MetaError || err instanceof TikTokError) {
      throw new HttpError(502, 'PLATFORM', `${NAME[platform]}: ${err.message}`)
    }
    console.error(err)
    throw new HttpError(502, 'PLATFORM', `${NAME[platform]} did not answer`)
  }
}

export async function accountOf(db: Conn, brandId: string, platform: Platform) {
  const [row] = await db
    .select()
    .from(brandAccounts)
    .where(and(eq(brandAccounts.brandId, brandId), eq(brandAccounts.platform, platform)))
  return row
}

/**
 * The brand's publishing accounts as connection statuses, read from the linked accounts: `fb`
 * with a Page, `ig` when that Page has an Instagram account, `tt` with a TikTok account. There is
 * no second copy to drift from them, so no status says "connected" without tokens behind it.
 */
export async function publishingOf(db: Conn, brandId: string) {
  const rows = await db
    .select({ platform: brandAccounts.platform, details: brandAccounts.details })
    .from(brandAccounts)
    .where(
      and(eq(brandAccounts.brandId, brandId), inArray(brandAccounts.platform, ['meta', 'tiktok'])),
    )
  const meta = rows.find((r) => r.platform === 'meta')
  const on = (yes: unknown) => (yes ? ('connected' as const) : ('off' as const))
  return {
    fb: on(meta),
    ig: on((meta?.details as { igUserId?: string | null } | undefined)?.igUserId),
    tt: on(rows.some((r) => r.platform === 'tiktok')),
  }
}

/** Refuses an account another brand holds; the reply never names that brand. */
async function assertFree(db: Conn, platform: Platform, accountId: string, brandId: string) {
  const [holder] = await db
    .select({ brandId: brandAccounts.brandId })
    .from(brandAccounts)
    .where(and(eq(brandAccounts.platform, platform), eq(brandAccounts.accountId, accountId)))
  if (holder && holder.brandId !== brandId) throw taken(platform)
}

/** Keeps the brand's account; two brands finishing with one account at once: the index decides. */
async function keepAccount(
  deps: Deps,
  platform: Platform,
  brandId: string,
  values: Omit<typeof brandAccounts.$inferInsert, 'brandId' | 'platform'>,
) {
  const set = { ...values, updatedAt: new Date() }
  await deps.db
    .insert(brandAccounts)
    .values({ brandId, platform, ...set })
    .onConflictDoUpdate({ target: [brandAccounts.brandId, brandAccounts.platform], set })
    .catch((err: unknown) => {
      if (uniqueViolation(err)) throw taken(platform)
      throw err
    })
}

const State = z.object({ code: z.string(), state: z.string() })

/**
 * The ends of the Meta and TikTok sign-ins. The browser comes back to the web app, which posts
 * the code here with its session: the state names the user who started, so a connect link sent
 * to someone else fails, with no cookie needed. Meta answers with the person's Pages and a sealed
 * choice, and `/meta/select` keeps the one picked: a Page token reaches the browser only sealed.
 */
export function accountCallbackRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .post('/meta/callback', async (c) => {
      const meta = appOf(deps.meta, 'meta')
      const user = c.var.user
      const { code, state } = await body(c, State)
      const started = meta.openState(state, deps.now().getTime())
      if (!started || started.userId !== user.id) {
        throw invalid('this Facebook link is not valid. Start again.', 'BAD_STATE')
      }
      const brand = await requireBrand(deps.db, user, started.brandId)
      const pages = await ask('meta', () => meta.pagesFor(code))
      if (pages.length === 0) {
        throw invalid('no Facebook Page came back. Give the app access to the Page.', 'NO_PAGES')
      }
      return c.json({
        brandId: brand.id,
        choice: meta.sealChoice(
          { userId: user.id, brandId: brand.id, pages },
          deps.now().getTime(),
        ),
        pages: pages.map((p) => ({ id: p.id, name: p.name, igUsername: p.igUsername })),
      })
    })
    .post('/meta/select', async (c) => {
      const meta = appOf(deps.meta, 'meta')
      const user = c.var.user
      const input = await body(c, z.object({ choice: z.string(), pageId: z.string() }))
      const offered = meta.openChoice(input.choice, deps.now().getTime())
      if (!offered || offered.userId !== user.id) {
        throw invalid('this Facebook link is not valid. Start again.', 'BAD_STATE')
      }
      const brand = await requireBrand(deps.db, user, offered.brandId)
      const page = offered.pages.find((p) => p.id === input.pageId)
      if (!page) throw notFound('page not found')
      await assertFree(deps.db, 'meta', page.id, brand.id)
      await keepAccount(deps, 'meta', brand.id, {
        accountId: page.id,
        username: page.name,
        tokens: meta.sealTokens({ pageToken: page.token }, bound('meta', brand.id, page.id)),
        details: { igUserId: page.igUserId, igUsername: page.igUsername },
        connectedBy: user.id,
      })
      return c.json({ brandId: brand.id, page: page.name, igUsername: page.igUsername })
    })
    .post('/tiktok/callback', async (c) => {
      const tiktok = appOf(deps.tiktok, 'tiktok')
      const user = c.var.user
      const { code, state } = await body(c, State)
      const started = tiktok.openState(state, deps.now().getTime())
      if (!started || started.userId !== user.id) {
        throw invalid('this TikTok link is not valid. Start again.', 'BAD_STATE')
      }
      const brand = await requireBrand(deps.db, user, started.brandId)
      const got = await ask('tiktok', () => tiktok.exchange(code, deps.now().getTime()))
      await assertFree(deps.db, 'tiktok', got.accountId, brand.id)
      await keepAccount(deps, 'tiktok', brand.id, {
        accountId: got.accountId,
        username: got.username,
        tokens: tiktok.sealTokens(got.tokens, bound('tiktok', brand.id, got.accountId)),
        details: {},
        connectedBy: user.id,
      })
      return c.json({ brandId: brand.id, username: got.username })
    })
}

/** Starting a brand's sign-in, and forgetting the account. */
export function accountBrandRoutes(deps: Deps) {
  const { db } = deps
  const start = (platform: Platform, app: MetaApp | TikTokApp | undefined) =>
    new Hono<BrandEnv>().post('/connect', (c) => {
      const ready = appOf(app, platform)
      const state = ready.sealState(
        { userId: c.var.user.id, brandId: c.var.brand.id },
        deps.now().getTime(),
      )
      return c.json({ url: ready.authorizeUrl(state) })
    })

  return new Hono<BrandEnv>()
    .route('/meta', start('meta', deps.meta))
    .route('/tiktok', start('tiktok', deps.tiktok))
    .delete('/meta', async (c) => {
      const brandId = c.var.brand.id
      // Meta can revoke only a person's whole grant, which would cut every Page they linked; the
      // Page token is forgotten instead.
      await db
        .delete(brandAccounts)
        .where(and(eq(brandAccounts.brandId, brandId), eq(brandAccounts.platform, 'meta')))
      return c.body(null, 204)
    })
    .delete('/tiktok', async (c) => {
      const brandId = c.var.brand.id
      const account = await accountOf(db, brandId, 'tiktok')
      let revoked = false
      if (account && deps.tiktok) {
        const tiktok = deps.tiktok
        // A revoke that fails, or tokens that no longer open, still forget the account: once our
        // only copy is gone, nothing uses the grant. The access token is refreshed first, since
        // it lasts only a day.
        try {
          await tiktok.revoke(await tiktokAccess(deps, tiktok, account))
          revoked = true
        } catch (err) {
          console.error('tiktok revoke failed', brandId, err)
        }
      }
      // The account read above only: one linked again meanwhile was not revoked, and stays.
      if (account) {
        await db
          .delete(brandAccounts)
          .where(
            and(
              eq(brandAccounts.brandId, brandId),
              eq(brandAccounts.platform, 'tiktok'),
              eq(brandAccounts.accountId, account.accountId),
            ),
          )
      }
      return c.json({ revoked })
    })
}

/** The brand's TikTok access token, refreshed and stored first when less than an hour is left. */
export async function tiktokAccess(
  deps: Deps,
  tiktok: TikTokApp,
  account: typeof brandAccounts.$inferSelect,
): Promise<string> {
  const seal = bound('tiktok', account.brandId, account.accountId)
  let current: TikTokTokens
  try {
    current = tiktok.openTokens(account.tokens, seal)
  } catch (err) {
    console.error('tiktok tokens did not open', account.brandId, err)
    throw new TikTokReconnect('stored tokens do not open')
  }
  const now = deps.now().getTime()
  if (current.expiresAt - now > 60 * 60 * 1000) return current.access
  const next = await tiktok.refresh(current, now)
  await deps.db
    .update(brandAccounts)
    .set({ tokens: tiktok.sealTokens(next, seal), updatedAt: new Date() })
    .where(
      and(
        eq(brandAccounts.brandId, account.brandId),
        eq(brandAccounts.platform, 'tiktok'),
        eq(brandAccounts.accountId, account.accountId),
      ),
    )
  return next.access
}

/** The brand's linked Meta and TikTok accounts as the state shows them: names only. */
export async function accountNames(db: Conn, brandId: string) {
  const rows = await db
    .select({
      platform: brandAccounts.platform,
      username: brandAccounts.username,
      details: brandAccounts.details,
    })
    .from(brandAccounts)
    .where(
      and(eq(brandAccounts.brandId, brandId), inArray(brandAccounts.platform, ['meta', 'tiktok'])),
    )
  const meta = rows.find((r) => r.platform === 'meta')
  const tiktok = rows.find((r) => r.platform === 'tiktok')
  return {
    meta: meta
      ? {
          page: meta.username,
          igUsername: (meta.details as { igUsername?: string | null }).igUsername ?? null,
        }
      : null,
    tiktok: tiktok ? { username: tiktok.username } : null,
  }
}
