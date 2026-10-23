import { Refused } from '@brandfactory/core/src/errors'
import { authenticate, type CoreDeps } from '@brandfactory/core/src/run'
import { type Context, Hono } from 'hono'
import {
  type Account,
  bound,
  forgetAccount,
  keepTokens,
  linkAccount,
  readAccount,
  readTikTokSend,
  recordTikTokSend,
  startTikTokSend,
  type TikTokSend,
  type Who,
} from './accounts'
import {
  type InboxStatus,
  type TikTokApp,
  TikTokReconnect,
  TikTokRefused,
  type TikTokTokens,
} from './tiktok'

/** Refresh a TikTok token when less than an hour of its day is left. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000
/** How long the signed storage link TikTok's upload reads from stays good. */
const READ_TTL_S = 60 * 60

const reconnect = () =>
  new Refused(409, 'TIKTOK_RECONNECT', 'the TikTok account needs connecting again')

function appOf(app: TikTokApp | undefined): TikTokApp {
  if (!app) throw new Refused(503, 'PLATFORM_OFF', 'TikTok is not set up')
  return app
}

/** A call to TikTok; a dead token says to reconnect, a refusal keeps TikTok's words. */
async function ask<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (err instanceof TikTokReconnect) throw reconnect()
    if (err instanceof TikTokRefused) throw new Refused(502, 'PLATFORM', err.message)
    console.error(err)
    throw new Refused(502, 'PLATFORM', 'TikTok did not answer')
  }
}

/** A send as the page reads it: TikTok's publish id stays on the server. */
function shown(send: TikTokSend | null) {
  if (!send) return null
  const { publishId: _, sendId: __, ...rest } = send
  return rest
}

/** The words a failed send keeps, for the person to read on the post. */
function failure(err: unknown): string {
  if (err instanceof TikTokRefused) return err.message
  if (err instanceof Refused && err.code === 'TIKTOK_RECONNECT') {
    return 'Connect TikTok again on Connections, then send it again.'
  }
  if (err instanceof Refused && err.code === 'TIKTOK_NOT_LINKED') {
    return 'TikTok was disconnected before it confirmed the draft. Check the TikTok inbox.'
  }
  console.error('tiktok send failed', err)
  return 'TikTok did not take the video. Try again.'
}

/**
 * TikTok for a brand: the Login Kit sign-in (scopes `user.info.basic` and `video.upload` only),
 * forgetting the account with its grant revoked, and sending a planned video post to the brand's
 * TikTok inbox as a draft, which the team then finishes in the TikTok app. Nothing is posted from
 * here. As for Pinterest, the sealed state names the person who started the sign-in, and every
 * read and write is one of the pack's internal moves run as the person, so the pack's walls decide
 * which brands and posts they reach, and an agent reaches none.
 */
export function tiktokRoutes(core: CoreDeps, tiktok: TikTokApp | undefined) {
  const now = () => core.now().getTime()
  const who = (c: Context): Who => ({ authorization: c.req.header('authorization') })
  const person = (c: Context) => authenticate(core.auth, c.req.header('authorization'))
  /** The refreshes on their way, by brand and account. */
  const refreshing = new Map<string, Promise<TikTokTokens>>()
  /**
   * The tokens a refresh stored, by brand and account. TikTok may rotate the refresh token, so a
   * request that read the row before a refresh landed must not refresh with the old one.
   */
  const refreshed = new Map<string, TikTokTokens>()

  /** The brand's access token, refreshed and stored first when it is about to run out. */
  async function access(c: Context, app: TikTokApp, brand: string, account: Account) {
    const seal = bound('tiktok', brand, account.accountId)
    let tokens: TikTokTokens
    try {
      tokens = app.openTokens(account.tokens, seal)
    } catch (err) {
      // The stored tokens no longer open (TOKEN_ENCRYPTION_KEY changed): only a new sign-in helps.
      console.error('tiktok tokens did not open', brand, err)
      throw reconnect()
    }
    const later = refreshed.get(seal)
    if (later && later.expiresAt > tokens.expiresAt) tokens = later
    if (tokens.expiresAt - now() > REFRESH_MARGIN_MS) return tokens.access
    let running = refreshing.get(seal)
    if (!running) {
      const current = tokens
      running = (async () => {
        const next = await ask(() => app.refresh(current, now()))
        // Kept in memory first: TikTok may have rotated the refresh token, and a failed store
        // below must not leave this process with the old one only.
        refreshed.set(seal, next)
        // Scoped to the account: a sign-in with another account meanwhile keeps its own tokens.
        await keepTokens(
          core,
          who(c),
          brand,
          'tiktok',
          account.accountId,
          app.sealTokens(next, seal),
        )
        return next
      })().finally(() => refreshing.delete(seal))
      refreshing.set(seal, running)
    }
    return (await running).access
  }

  /** The brand's linked account, or a refusal that says to connect it. */
  async function linked(c: Context, brand: string) {
    const account = await readAccount(core, who(c), brand, 'tiktok')
    if (!account) throw new Refused(409, 'TIKTOK_NOT_LINKED', 'connect the brand’s TikTok first')
    return account
  }

  /** Asks TikTok where a send stands and keeps the answer; a send not with TikTok yet stays. */
  async function settle(c: Context, app: TikTokApp, brand: string, id: string) {
    const send = await readTikTokSend(core, who(c), brand, id)
    if (!send || send.status !== 'processing' || !send.publishId) return send
    let got: InboxStatus
    try {
      const token = await access(c, app, brand, await linked(c, brand))
      got = await ask(() => app.status(token, send.publishId!))
    } catch (err) {
      // The account was cut off or disconnected: nothing here can ask TikTok any more, so the send
      // ends with words that say what to do, instead of waiting for ever.
      const gone = ['TIKTOK_RECONNECT', 'TIKTOK_NOT_LINKED']
      if (!(err instanceof Refused && gone.includes(err.code))) throw err
      got = { status: 'failed', reason: failure(err) }
    }
    if (got.status === 'processing') return send
    return (await recordTikTokSend(core, who(c), brand, id, send.sendId!, got)) ?? send
  }

  return (
    new Hono()
      // The start of a sign-in for a brand the person reaches (the account read refuses others).
      .post('/brands/:brand/tiktok/connect', async (c) => {
        const app = appOf(tiktok)
        const brand = c.req.param('brand')
        await readAccount(core, who(c), brand, 'tiktok')
        const state = app.sealState({ userId: await person(c), brandId: brand }, now())
        return c.json({ url: app.authorizeUrl(state) })
      })

      .post('/tiktok/callback', async (c) => {
        const app = appOf(tiktok)
        const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
        const code = body?.code
        const state = body?.state
        if (typeof code !== 'string' || !code || typeof state !== 'string' || !state) {
          throw new Refused(400, 'VALIDATION', 'send code and state')
        }
        // The brand a sign-in started for, if the state is this person's and still fresh.
        const was = app.openState(state, now())
        if (!was || was.userId !== (await person(c))) {
          throw new Refused(400, 'TIKTOK_STATE', 'this TikTok link is not valid. Start again.')
        }
        const brand = was.brandId
        // The person may have lost the brand in the ten minutes.
        await readAccount(core, who(c), brand, 'tiktok')
        const got = await ask(() => app.exchange(code, now()))
        // Another brand's account is refused, never moved.
        await linkAccount(core, who(c), brand, 'tiktok', {
          accountId: got.accountId,
          username: got.name,
          tokens: app.sealTokens(got.tokens, bound('tiktok', brand, got.accountId)),
          details: { avatar: got.avatar },
        })
        return c.json({ brandId: brand, name: got.name })
      })

      .delete('/brands/:brand/tiktok', async (c) => {
        const brand = c.req.param('brand')
        const account = await readAccount(core, who(c), brand, 'tiktok')
        let revoked = false
        if (account && tiktok) {
          // A revoke that fails, or tokens that no longer open, still forget the account: once our
          // only copy is gone, nothing uses the grant.
          try {
            await tiktok.revoke(await access(c, tiktok, brand, account))
            revoked = true
          } catch (err) {
            console.error('tiktok revoke failed', brand, err)
          }
        }
        // The account read above only: one linked again meanwhile was not revoked, and stays.
        if (account) await forgetAccount(core, who(c), brand, 'tiktok', account.accountId)
        return c.json({ revoked })
      })

      // Sends a planned video post to the brand's TikTok inbox. The pack's move checks the walls
      // and marks the send first, so a second press while it runs is refused.
      .post('/brands/:brand/posts/:post/tiktok', async (c) => {
        const app = appOf(tiktok)
        const files = core.files
        if (!files) throw new Refused(501, 'NO_FILES', 'this core keeps no files')
        const brand = c.req.param('brand')
        const id = c.req.param('post')
        const account = await linked(c, brand)
        const video = await startTikTokSend(core, who(c), brand, id)
        let publishId: string
        try {
          const token = await access(c, app, brand, account)
          const url = await files.store.signedReadUrl(video.key, READ_TTL_S)
          publishId = await app.sendToInbox(token, { url, mime: video.mime, bytes: video.bytes })
        } catch (err) {
          const reason = failure(err)
          return c.json(
            shown(
              await recordTikTokSend(core, who(c), brand, id, video.sendId, {
                status: 'failed',
                reason,
              }),
            ),
          )
        }
        await recordTikTokSend(core, who(c), brand, id, video.sendId, {
          status: 'processing',
          publishId,
        })
        // TikTok often has the draft in the inbox at once; otherwise the page asks again.
        const send = await settle(c, app, brand, id).catch((err: unknown) => {
          console.error('tiktok status after the upload', err)
          return null
        })
        return c.json(shown(send ?? (await readTikTokSend(core, who(c), brand, id))))
      })

      // Where a post's send to the TikTok inbox stands, asked of TikTok while it is processing.
      .get('/brands/:brand/posts/:post/tiktok', async (c) => {
        const app = appOf(tiktok)
        const send = await settle(c, app, c.req.param('brand'), c.req.param('post'))
        if (!send) throw new Refused(404, 'NOT_FOUND', 'this post was not sent to TikTok')
        return c.json(shown(send))
      })
  )
}
