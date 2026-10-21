import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Deps } from '../app'
import { requireBrand } from '../authz'
import { type AppEnv } from '../context'
import { brandAccounts, connections } from '../db/schema'
import { conflict, HttpError, invalid, notFound } from '../errors'
import { body } from '../http'
import { type PinterestApp, PinterestReconnect } from '../pinterest'
import { type BrandEnv } from './shared'

/** Refresh when less than a day is left, so a token never runs out mid-request. */
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000

const takenError = () =>
  conflict('this Pinterest account belongs to another brand', 'ACCOUNT_TAKEN')

const reconnect = () =>
  conflict('the Pinterest account needs connecting again', 'PINTEREST_RECONNECT')

function pinterestOf(deps: Deps): PinterestApp {
  if (!deps.pinterest) throw new HttpError(503, 'PINTEREST_OFF', 'Pinterest is not set up')
  return deps.pinterest
}

/** What a brand's tokens are sealed to: they open only in that brand's row for that account. */
const bound = (brandId: string, accountId: string) => `pinterest:${brandId}:${accountId}`

/** A call to Pinterest; a dead token says to reconnect, anything else is Pinterest's fault. */
async function ask<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (err instanceof PinterestReconnect) throw reconnect()
    console.error(err)
    throw new HttpError(502, 'PINTEREST', 'Pinterest did not answer')
  }
}

async function accountOf(deps: Deps, brandId: string) {
  const [row] = await deps.db
    .select()
    .from(brandAccounts)
    .where(and(eq(brandAccounts.brandId, brandId), eq(brandAccounts.platform, 'pinterest')))
  return row
}

/** True for Postgres's unique violation, which drizzle passes on as the error's cause. */
const uniqueViolation = (err: unknown) =>
  (err as { cause?: { code?: string } })?.cause?.code === '23505'

/** The brand's access token, refreshed and stored first when it is about to run out. */
async function accessToken(
  deps: Deps,
  pinterest: PinterestApp,
  account: typeof brandAccounts.$inferSelect,
): Promise<string> {
  const seal = bound(account.brandId, account.accountId)
  let tokens
  try {
    tokens = pinterest.openTokens(account.tokens, seal)
  } catch (err) {
    // The stored tokens no longer open (TOKEN_ENCRYPTION_KEY changed): only a new sign-in helps.
    console.error('pinterest tokens did not open', account.brandId, err)
    throw reconnect()
  }
  const now = deps.now().getTime()
  if (tokens.expiresAt - now > REFRESH_MARGIN_MS) return tokens.access
  const next = await ask(() => pinterest.refresh(tokens, now))
  await deps.db
    .update(brandAccounts)
    .set({ tokens: pinterest.sealTokens(next, seal), updatedAt: new Date() })
    // Scoped to the account: a sign-in with another account meanwhile keeps its own tokens.
    .where(
      and(
        eq(brandAccounts.brandId, account.brandId),
        eq(brandAccounts.platform, 'pinterest'),
        eq(brandAccounts.accountId, account.accountId),
      ),
    )
  return next.access
}

/**
 * The end of a brand's Pinterest sign-in. The browser comes back to the web app, which posts the
 * code here with its session: the state names the user who started, so a connect link sent to
 * someone else fails, with no cookie needed.
 */
export function pinterestCallbackRoute(deps: Deps) {
  return new Hono<AppEnv>().post('/callback', async (c) => {
    const pinterest = pinterestOf(deps)
    const user = c.var.user
    const { code, state } = await body(c, z.object({ code: z.string(), state: z.string() }))
    const started = pinterest.openState(state, deps.now().getTime())
    if (!started || started.userId !== user.id) {
      throw invalid('this Pinterest link is not valid. Start again.', 'PINTEREST_STATE')
    }
    // The person may have lost the brand in the ten minutes.
    const brand = await requireBrand(deps.db, user, started.brandId)
    const got = await ask(() => pinterest.exchange(code, deps.now().getTime()))

    const [holder] = await deps.db
      .select({ brandId: brandAccounts.brandId })
      .from(brandAccounts)
      .where(
        and(eq(brandAccounts.platform, 'pinterest'), eq(brandAccounts.accountId, got.accountId)),
      )
    // Another brand's account is refused, never moved, and the reply does not name the brand.
    if (holder && holder.brandId !== brand.id) throw takenError()

    const previous = await accountOf(deps, brand.id)
    const values = {
      accountId: got.accountId,
      username: got.username,
      tokens: pinterest.sealTokens(got.tokens, bound(brand.id, got.accountId)),
      connectedBy: user.id,
      updatedAt: new Date(),
    }
    // Two brands finishing with the same account at once both pass the check above; the unique
    // index lets one in, and the other gets the same refusal.
    await deps.db
      .transaction(async (tx) => {
        await tx
          .insert(brandAccounts)
          .values({ brandId: brand.id, platform: 'pinterest', ...values })
          .onConflictDoUpdate({
            target: [brandAccounts.brandId, brandAccounts.platform],
            set: values,
          })
        // Another account for the brand: the old account's board is not on the new one.
        if (previous && previous.accountId !== got.accountId) {
          await tx
            .update(connections)
            .set({ status: 'off', externalId: null, updatedAt: new Date() })
            .where(and(eq(connections.brandId, brand.id), eq(connections.key, 'pinterest')))
        }
      })
      .catch((err: unknown) => {
        if (uniqueViolation(err)) throw takenError()
        throw err
      })
    return c.json({ brandId: brand.id, username: got.username })
  })
}

/** A brand's Pinterest account, the board its moodboard reads, and that board's pins, read live. */
export function pinterestBrandRoutes(deps: Deps) {
  const { db } = deps

  async function boardOf(brandId: string) {
    const [row] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.brandId, brandId), eq(connections.key, 'pinterest')))
    return row?.status === 'connected' ? row.externalId : null
  }

  return new Hono<BrandEnv>()
    .post('/connect', (c) => {
      const pinterest = pinterestOf(deps)
      const state = pinterest.sealState(
        { userId: c.var.user.id, brandId: c.var.brand.id },
        deps.now().getTime(),
      )
      return c.json({ url: pinterest.authorizeUrl(state) })
    })
    .get('/', async (c) => {
      const pinterest = pinterestOf(deps)
      const brandId = c.var.brand.id
      const account = await accountOf(deps, brandId)
      if (!account) return c.json({ account: null, boards: [] })
      const access = await accessToken(deps, pinterest, account)
      const [boards, picked] = await Promise.all([
        ask(() => pinterest.boards(access)),
        boardOf(brandId),
      ])
      return c.json({
        account: { username: account.username },
        boards: boards.map((b) => ({ ...b, picked: b.id === picked })),
      })
    })
    .put('/', async (c) => {
      const pinterest = pinterestOf(deps)
      const brandId = c.var.brand.id
      const { boardId } = await body(c, z.object({ boardId: z.string().min(1).max(40) }))
      const account = await accountOf(deps, brandId)
      if (!account) throw conflict('connect the brand’s Pinterest first', 'PINTEREST_NO_ACCOUNT')
      const access = await accessToken(deps, pinterest, account)
      const boards = await ask(() => pinterest.boards(access))
      if (!boards.some((b) => b.id === boardId)) throw notFound('board not found')
      const [row] = await db
        .insert(connections)
        .values({ brandId, key: 'pinterest', status: 'connected', externalId: boardId })
        .onConflictDoUpdate({
          target: [connections.brandId, connections.key],
          set: { status: 'connected', externalId: boardId, updatedAt: new Date() },
        })
        .returning()
      return c.json(row!)
    })
    .delete('/', async (c) => {
      const brandId = c.var.brand.id
      // Pinterest has no revoke for a user's token: once our only copy is gone, nothing uses it.
      await db.transaction(async (tx) => {
        await tx
          .delete(brandAccounts)
          .where(and(eq(brandAccounts.brandId, brandId), eq(brandAccounts.platform, 'pinterest')))
        await tx
          .update(connections)
          .set({ status: 'off', externalId: null, updatedAt: new Date() })
          .where(and(eq(connections.brandId, brandId), eq(connections.key, 'pinterest')))
      })
      return c.body(null, 204)
    })
    .get('/pins', async (c) => {
      const pinterest = pinterestOf(deps)
      const brandId = c.var.brand.id
      const boardId = await boardOf(brandId)
      if (!boardId) throw notFound('this brand reads no Pinterest board')
      const account = await accountOf(deps, brandId)
      if (!account) throw reconnect()
      const access = await accessToken(deps, pinterest, account)
      return c.json(await ask(() => pinterest.pins(access, boardId)))
    })
}
