import { Refused } from '@brandfactory/core/src/errors'
import { authenticate, type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import {
  type Account,
  bound,
  forgetAccount,
  keepBoard,
  keepTokens,
  linkAccount,
  readAccount,
  type Who,
} from './accounts'
import { type PinterestApp, PinterestReconnect } from './pinterest'
import { type TikTokApp } from './tiktok'
import { tiktokRoutes } from './tiktok-routes'

/** Refresh a Pinterest token when less than a day is left, so it never runs out mid-request. */
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000

export interface Platforms {
  pinterest?: PinterestApp
  tiktok?: TikTokApp
}

const reconnect = () =>
  new Refused(409, 'PINTEREST_RECONNECT', 'the Pinterest account needs connecting again')

function appOf(app: PinterestApp | undefined): PinterestApp {
  if (!app) throw new Refused(503, 'PLATFORM_OFF', 'Pinterest is not set up')
  return app
}

/** A call to Pinterest; a dead token says to reconnect. */
async function ask<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (err instanceof PinterestReconnect) throw reconnect()
    console.error(err)
    throw new Refused(502, 'PLATFORM', 'Pinterest did not answer')
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

/**
 * The brands' own accounts: which platforms the server can sign in to, Pinterest's sign-in, its
 * boards and pins read live, and forgetting the account. The browser comes back from Pinterest to
 * the web app, which posts the code here with its session: the sealed state names the person who
 * started, so a connect link sent to someone else fails, with no cookie needed. Every read and
 * write of an account is one of the pack's internal moves, run as the person, so the pack's row
 * rules decide which brands they reach.
 */
export function accountRoutes(core: CoreDeps, platforms: Platforms) {
  const now = () => core.now().getTime()
  const who = (c: Context): Who => ({ authorization: c.req.header('authorization') })
  const person = (c: Context) => authenticate(core.auth, c.req.header('authorization'))
  const brandOf = (c: Context) => c.req.param('brand')!
  /** The refreshes on their way, by brand and account. */
  const refreshing = new Map<string, Promise<string>>()

  /** The brand's Pinterest access token, refreshed and stored first when it is about to run out. */
  async function pinterestAccess(
    c: Context,
    pinterest: PinterestApp,
    brand: string,
    account: Account,
  ) {
    const seal = bound('pinterest', brand, account.accountId)
    let tokens
    try {
      tokens = pinterest.openTokens(account.tokens, seal)
    } catch (err) {
      // The stored tokens no longer open (TOKEN_ENCRYPTION_KEY changed): only a new sign-in helps.
      console.error('pinterest tokens did not open', brand, err)
      throw reconnect()
    }
    if (tokens.expiresAt - now() > REFRESH_MARGIN_MS) return tokens.access
    // One refresh at a time per brand and account (the core runs as one process): two reads at
    // once, such as the setup's boards and the moodboard's pins, would otherwise both spend the
    // same refresh token, and Pinterest may refuse the second.
    const key = seal
    let running = refreshing.get(key)
    if (!running) {
      running = (async () => {
        const next = await ask(() => pinterest.refresh(tokens, now()))
        // Scoped to the account: a sign-in with another account meanwhile keeps its own tokens.
        await keepTokens(
          core,
          who(c),
          brand,
          'pinterest',
          account.accountId,
          pinterest.sealTokens(next, seal),
        )
        return next.access
      })().finally(() => refreshing.delete(key))
      refreshing.set(key, running)
    }
    return running
  }

  return (
    new Hono()
      // Which platforms have an app set up on this server: the web app offers Connect only for
      // these. It names no account and needs no sign-in.
      .get('/platforms', (c) =>
        c.json({ pinterest: Boolean(platforms.pinterest), tiktok: Boolean(platforms.tiktok) }),
      )

      // TikTok's sign-in and the send of a planned video to the brand's TikTok inbox.
      .route('/', tiktokRoutes(core, platforms.tiktok))

      // The start of a sign-in for a brand the person reaches (the account read refuses others).
      .post('/brands/:brand/pinterest/connect', async (c) => {
        const pinterest = appOf(platforms.pinterest)
        const brand = brandOf(c)
        await readAccount(core, who(c), brand, 'pinterest')
        const state = pinterest.sealState({ userId: await person(c), brandId: brand }, now())
        return c.json({ url: pinterest.authorizeUrl(state) })
      })

      .post('/pinterest/callback', async (c) => {
        const pinterest = appOf(platforms.pinterest)
        const { code, state } = await strings(c, 'code', 'state')
        // The brand a sign-in started for, if the state is this person's and still fresh.
        const was = pinterest.openState(state, now())
        if (!was || was.userId !== (await person(c))) {
          throw new Refused(
            400,
            'PINTEREST_STATE',
            'this Pinterest link is not valid. Start again.',
          )
        }
        const brand = was.brandId
        // The person may have lost the brand in the ten minutes.
        await readAccount(core, who(c), brand, 'pinterest')
        const got = await ask(() => pinterest.exchange(code, now()))
        // Another brand's account is refused, never moved; the same account keeps its board.
        await linkAccount(core, who(c), brand, 'pinterest', {
          accountId: got.accountId,
          username: got.username,
          tokens: pinterest.sealTokens(got.tokens, bound('pinterest', brand, got.accountId)),
          details: {},
        })
        return c.json({ brandId: brand, username: got.username })
      })

      .get('/brands/:brand/pinterest', async (c) => {
        const pinterest = appOf(platforms.pinterest)
        const brand = brandOf(c)
        const account = await readAccount(core, who(c), brand, 'pinterest')
        if (!account) return c.json({ account: null, boards: [] })
        const access = await pinterestAccess(c, pinterest, brand, account)
        const boards = await ask(() => pinterest.boards(access))
        return c.json({
          account: { username: account.username },
          boards: boards.map((b) => ({ ...b, picked: b.id === account.details.board })),
        })
      })

      .put('/brands/:brand/pinterest', async (c) => {
        const pinterest = appOf(platforms.pinterest)
        const brand = brandOf(c)
        const { boardId } = await strings(c, 'boardId')
        const account = await readAccount(core, who(c), brand, 'pinterest')
        if (!account) {
          throw new Refused(409, 'PINTEREST_NO_ACCOUNT', 'connect the brand’s Pinterest first')
        }
        const access = await pinterestAccess(c, pinterest, brand, account)
        const boards = await ask(() => pinterest.boards(access))
        if (!boards.some((b) => b.id === boardId)) {
          throw new Refused(404, 'NOT_FOUND', 'board not found')
        }
        return c.json(await keepBoard(core, who(c), brand, boardId))
      })

      .delete('/brands/:brand/pinterest', async (c) => {
        const brand = brandOf(c)
        // Pinterest has no revoke for a user's token: once our only copy is gone (the log never
        // keeps one), nothing uses it.
        const account = await readAccount(core, who(c), brand, 'pinterest')
        if (account) await forgetAccount(core, who(c), brand, 'pinterest', account.accountId)
        return c.body(null, 204)
      })

      .get('/brands/:brand/pinterest/pins', async (c) => {
        const pinterest = appOf(platforms.pinterest)
        const brand = brandOf(c)
        const account = await readAccount(core, who(c), brand, 'pinterest')
        const board = account?.details.board as string | undefined
        if (!account || !board) {
          throw new Refused(404, 'NOT_FOUND', 'this brand reads no Pinterest board')
        }
        const access = await pinterestAccess(c, pinterest, brand, account)
        return c.json(await ask(() => pinterest.pins(access, board)))
      })
  )
}
