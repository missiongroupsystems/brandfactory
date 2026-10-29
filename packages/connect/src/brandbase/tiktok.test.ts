import { type Files } from '@brandfactory/core/src/files'
import { addPrincipal, setLoadout } from '@brandfactory/core/src/registry'
import { describe, expect, it } from 'vitest'
import { platformsFromEnv } from './env'
import { tiktokApp } from './tiktok'
import { NOW, serve } from './test-core'

const HOUR = 60 * 60 * 1000
const MB = 1024 * 1024
const SIG = 'A'.repeat(43)
const KEY = 'brandbase/00000000-0000-4000-8000-0000000000b1.mp4'

/**
 * A stand-in for TikTok and for our storage. The code names the account that signs in
 * (`code-casa` signs in as `open-casa`); `scope` is what the person allowed on TikTok's screen.
 * Each inbox upload is kept with its chunks, and `status` says what status/fetch answers. Any
 * request it does not know fails the test, so nothing reaches the network.
 */
function fakeTikTok() {
  const calls: string[] = []
  const uploads: { init: Record<string, unknown>; chunks: { range: string; bytes: number }[] }[] =
    []
  const state = {
    scope: 'user.info.basic,video.upload',
    status: 'SEND_TO_USER_INBOX',
    failReason: undefined as string | undefined,
    initError: null as null | { status: number; code: string },
    statusRevoked: false,
    videoBytes: 25 * MB,
    revoked: [] as string[],
    issued: 0,
  }
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  const ok = (data: unknown) => json({ data, error: { code: 'ok', message: '', log_id: 'l' } })

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`)
    if (url.startsWith('https://storage.test/')) {
      return new Response(new Uint8Array(state.videoBytes), {
        headers: { 'content-length': String(state.videoBytes) },
      })
    }
    if (url.startsWith('https://upload.tiktok.test/')) {
      const body = init?.body as Uint8Array
      const upload = uploads[uploads.length - 1]!
      upload.chunks.push({
        range: new Headers(init?.headers).get('content-range')!,
        bytes: body.byteLength,
      })
      const done = upload.chunks.length === upload.init.total_chunk_count
      return new Response(null, { status: done ? 201 : 206 })
    }
    const path = url.replace('https://open.tiktokapis.com/v2', '')
    if (path === '/oauth/token/') {
      const params = new URLSearchParams(String(init?.body))
      expect(params.get('client_key')).toBe('client-key')
      expect(params.get('client_secret')).toBe('client-secret')
      const refresh = params.get('grant_type') === 'refresh_token'
      if (refresh && params.get('refresh_token')!.endsWith(':dead')) {
        return json({ error: 'invalid_grant', error_description: 'expired' }, 400)
      }
      const acct = refresh
        ? params.get('refresh_token')!.split(':')[1]
        : params.get('code')!.replace('code-', 'open-')
      if (!refresh) expect(params.get('redirect_uri')).toBe('https://brandbase.test/connect/tiktok')
      state.issued++
      return json({
        open_id: acct,
        access_token: `access:${acct}:${state.issued}`,
        refresh_token: `refresh:${acct}:${state.issued}`,
        expires_in: 86400,
        refresh_expires_in: 31536000,
        scope: state.scope,
        token_type: 'Bearer',
      })
    }
    if (path === '/oauth/revoke/') {
      state.revoked.push(new URLSearchParams(String(init?.body)).get('token')!)
      return json({})
    }
    const auth = new Headers(init?.headers).get('authorization') ?? ''
    const acct = /^Bearer access:([^:]+):/.exec(auth)?.[1]
    if (!acct) {
      return json({ error: { code: 'access_token_invalid', message: 'bad token' } }, 401)
    }
    if (path === '/user/info/?fields=open_id,display_name,avatar_url') {
      return ok({
        user: {
          open_id: acct,
          display_name: 'Casa Vostra',
          avatar_url: 'https://p16.tiktokcdn.test/casa.jpeg',
        },
      })
    }
    if (path === '/post/publish/inbox/video/init/') {
      if (state.initError) {
        return json(
          { error: { code: state.initError.code, message: 'refused', log_id: 'l' } },
          state.initError.status,
        )
      }
      const body = JSON.parse(String(init?.body)) as { source_info: Record<string, unknown> }
      uploads.push({ init: body.source_info, chunks: [] })
      return ok({
        publish_id: `v_inbox_file~v2.${uploads.length}`,
        upload_url: `https://upload.tiktok.test/video/?upload_id=${uploads.length}`,
      })
    }
    if (path === '/post/publish/status/fetch/') {
      if (state.statusRevoked) {
        return json({ error: { code: 'access_token_invalid', message: 'revoked' } }, 401)
      }
      return ok({ status: state.status, fail_reason: state.failReason })
    }
    throw new Error(`unexpected request ${url}`)
  }

  const app = tiktokApp({
    clientKey: 'client-key',
    clientSecret: 'client-secret',
    redirectUrl: 'https://brandbase.test/connect/tiktok',
    masterKey: Buffer.alloc(32, 9),
    fetch: fetch as typeof globalThis.fetch,
  })
  return { app, calls, uploads, state }
}

/** Storage that hands out a read link the stand-in answers. */
const files: Files = {
  secret: 'x'.repeat(32),
  publicUrl: 'https://core.test',
  store: {
    signedWriteUrl: async () => ({ url: 'https://storage.test/put', headers: {} }),
    signedReadUrl: async (key) => `https://storage.test/${key}?token=t`,
  },
}

type T = Awaited<ReturnType<typeof setUp>>

async function setUp(now = NOW) {
  const tiktok = fakeTikTok()
  const t = await serve({ tiktok: tiktok.app }, now, files)
  // casa's planned TikTok video, with its uploaded file.
  await t.db.exec(`
    insert into brandbase.media (id, brand_id, storage_key, kind, mime, bytes)
      values ('v1', 'casa', '${KEY}', 'video', 'video/mp4', ${25 * MB});
    insert into brandbase.posts (id, brand_id, format, hook, day, time, channels, media) values
      ('tp1', 'casa', 'reel', 'Pasta', '2026-10-12', '18:00', '{ig,tt}',
       '[{"src": "https://core.test/files/${SIG}/${KEY}#video", "kind": "video"}]');
  `)
  return { ...t, tiktok }
}

/** Starts casa's sign-in as `token` and finishes it with the account `code` names. */
async function connect(t: T, code = 'code-casa', token = 'member', brand = 'casa') {
  const started = await t.call('POST', `/brands/${brand}/tiktok/connect`, {}, token)
  const state = new URL(started.data.url).searchParams.get('state')!
  const done = await t.call('POST', '/tiktok/callback', { code, state }, token)
  return { started, state, done }
}

const send = (t: T, post = 'tp1', token = 'member') =>
  t.call('POST', `/brands/casa/posts/${post}/tiktok`, {}, token)

describe('TikTok', () => {
  it('says TikTok is set up only when its app is', async () => {
    const on = await setUp()
    expect((await on.call('GET', '/platforms')).data).toEqual({
      pinterest: false,
      tiktok: true,
      instagram: false,
      facebook: false,
    })
    const off = await serve({})
    expect((await off.call('GET', '/platforms')).data).toEqual({
      pinterest: false,
      tiktok: false,
      instagram: false,
      facebook: false,
    })
    expect(await off.call('POST', '/brands/casa/tiktok/connect')).toMatchObject({
      status: 503,
      data: { code: 'PLATFORM_OFF' },
    })
  })

  it('asks for the two upload scopes only, and links the account with its name and picture', async () => {
    const t = await setUp()
    const { started, done } = await connect(t)
    const url = new URL(started.data.url)
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
    expect(url.searchParams.get('client_key')).toBe('client-key')
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.upload')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe('https://brandbase.test/connect/tiktok')
    expect(done).toMatchObject({ status: 200, data: { brandId: 'casa', name: 'Casa Vostra' } })

    const [row] = await t.accounts()
    expect(row).toMatchObject({ brand_id: 'casa', platform: 'tiktok', account_id: 'open-casa' })
    expect(row!.tokens).not.toContain('access:')
    expect((await t.stateOf('casa')).tiktok).toEqual({
      name: 'Casa Vostra',
      avatar: 'https://p16.tiktokcdn.test/casa.jpeg',
    })
  })

  it('refuses a sign-in where the person turned the upload scope off', async () => {
    const t = await setUp()
    t.tiktok.state.scope = 'user.info.basic'
    const { done } = await connect(t)
    expect(done).toMatchObject({ status: 502, data: { code: 'PLATFORM' } })
    expect(done.data.message).toContain('Allow Brand Base to upload videos')
    expect(await t.accounts()).toEqual([])
    // The partial grant goes back: nothing is kept that could use it.
    expect(t.tiktok.state.revoked).toEqual(['access:open-casa:1'])
  })

  it('refuses a connect link finished by someone else, and a brand the person does not reach', async () => {
    const t = await setUp()
    const started = await t.call('POST', '/brands/casa/tiktok/connect')
    const state = new URL(started.data.url).searchParams.get('state')!
    const other = await t.call('POST', '/tiktok/callback', { code: 'code-casa', state }, 'both')
    expect(other).toMatchObject({ status: 400, data: { code: 'TIKTOK_STATE' } })
    // temper is company B's: member does not reach it.
    const temper = await t.call('POST', '/brands/temper/tiktok/connect')
    expect(temper).toMatchObject({ status: 404 })
    expect(await t.accounts()).toEqual([])
  })

  it('sends a planned video to the inbox in chunks, and says it is in the inbox', async () => {
    const t = await setUp()
    await connect(t)
    const res = await send(t)
    expect(res).toMatchObject({
      status: 200,
      data: { postId: 'tp1', status: 'sent', reason: null },
    })
    expect(res.data.publishId).toBeUndefined()
    // 25 MB: two chunks of 10 MB, the last one holding the trailing 5 MB.
    expect(t.tiktok.uploads).toEqual([
      {
        init: {
          source: 'FILE_UPLOAD',
          video_size: 25 * MB,
          chunk_size: 10 * MB,
          total_chunk_count: 2,
        },
        chunks: [
          { range: `bytes 0-${10 * MB - 1}/${25 * MB}`, bytes: 10 * MB },
          { range: `bytes ${10 * MB}-${25 * MB - 1}/${25 * MB}`, bytes: 15 * MB },
        ],
      },
    ])
    expect((await t.stateOf('casa')).tiktokSends).toMatchObject([
      { postId: 'tp1', status: 'sent', reason: null },
    ])
  })

  it('sends a video under 10 MB whole', async () => {
    const t = await setUp()
    t.tiktok.state.videoBytes = 4 * MB
    await connect(t)
    await send(t)
    expect(t.tiktok.uploads[0]).toEqual({
      init: { source: 'FILE_UPLOAD', video_size: 4 * MB, chunk_size: 4 * MB, total_chunk_count: 1 },
      chunks: [{ range: `bytes 0-${4 * MB - 1}/${4 * MB}`, bytes: 4 * MB }],
    })
  })

  it('keeps asking TikTok while the video is processing, and says when it fails', async () => {
    const t = await setUp()
    await connect(t)
    t.tiktok.state.status = 'PROCESSING_UPLOAD'
    expect((await send(t)).data).toMatchObject({ status: 'processing' })
    // A second press while TikTok works on it.
    expect(await send(t)).toMatchObject({ status: 409, data: { code: 'TIKTOK_SENDING' } })
    expect((await t.call('GET', '/brands/casa/posts/tp1/tiktok')).data).toMatchObject({
      status: 'processing',
    })
    t.tiktok.state.status = 'FAILED'
    t.tiktok.state.failReason = 'frame_rate_check_failed'
    const failed = await t.call('GET', '/brands/casa/posts/tp1/tiktok')
    expect(failed.data).toEqual({
      postId: 'tp1',
      status: 'failed',
      reason: 'TikTok takes videos at 23 to 60 frames a second.',
      updatedAt: expect.any(String),
    })
  })

  it("says so in words when TikTok's draft cap for unaudited apps is reached, and may send again", async () => {
    const t = await setUp()
    await connect(t)
    t.tiktok.state.initError = { status: 403, code: 'spam_risk_too_many_pending_share' }
    const res = await send(t)
    expect(res.data).toMatchObject({ status: 'failed' })
    expect(res.data.reason).toContain('at most 5 drafts')
    t.tiktok.state.initError = null
    expect((await send(t)).data).toMatchObject({ status: 'sent', reason: null })
  })

  it('ends a processing send with words when the account is cut off, instead of waiting for ever', async () => {
    const t = await setUp()
    await connect(t)
    t.tiktok.state.status = 'PROCESSING_UPLOAD'
    expect((await send(t)).data).toMatchObject({ status: 'processing' })
    t.tiktok.state.statusRevoked = true
    const res = await t.call('GET', '/brands/casa/posts/tp1/tiktok')
    expect(res).toMatchObject({
      status: 200,
      data: {
        status: 'failed',
        reason: 'Connect TikTok again on Connections, then send it again.',
      },
    })
  })

  it('ends a processing send with words when the account is disconnected meanwhile', async () => {
    const t = await setUp()
    await connect(t)
    t.tiktok.state.status = 'PROCESSING_UPLOAD'
    await send(t)
    await t.call('DELETE', '/brands/casa/tiktok')
    const res = await t.call('GET', '/brands/casa/posts/tp1/tiktok')
    expect(res.data).toMatchObject({ status: 'failed' })
    expect(res.data.reason).toContain('TikTok was disconnected')
    expect(res.data.sendId).toBeUndefined()
  })

  it('refreshes a token about to run out first, and keeps the new one', async () => {
    const t = await setUp()
    await connect(t)
    t.setNow(new Date(NOW.getTime() + 23.5 * HOUR))
    const before = (await t.accounts())[0]!.tokens
    expect((await send(t)).data).toMatchObject({ status: 'sent' })
    expect(
      t.tiktok.calls.filter((c) => c === 'POST https://open.tiktokapis.com/v2/oauth/token/'),
    ).toHaveLength(2)
    expect((await t.accounts())[0]!.tokens).not.toBe(before)
  })

  it('needs the account linked, and a TikTok post with one uploaded video', async () => {
    const t = await setUp()
    expect(await send(t)).toMatchObject({ status: 409, data: { code: 'TIKTOK_NOT_LINKED' } })
    await connect(t)
    await t.db.exec(`insert into brandbase.posts (id, brand_id, format, hook, day, channels, media)
      values ('ig-only', 'casa', 'reel', 'h', '2026-10-12', '{ig}', '[]')`)
    expect(await send(t, 'ig-only')).toMatchObject({ status: 409, data: { code: 'NOT_ON_TIKTOK' } })
    expect(t.tiktok.uploads).toEqual([])
  })

  it('lets only a person who reaches the brand send: not an agent, not another company', async () => {
    const t = await setUp()
    await connect(t)
    await addPrincipal(t.db, 'member-agent', 'member')
    await setLoadout(t.db, 'member-agent', 'brandbase', ['account.read', 'post.tiktok_start'])
    expect(await send(t, 'tp1', 'member-agent')).toMatchObject({
      status: 403,
      data: { code: 'NOT_A_PERSON' },
    })
    await addPrincipal(t.db, 'b-owner')
    await setLoadout(t.db, 'b-owner', 'brandbase', ['account.read', 'post.tiktok_start'])
    expect(await send(t, 'tp1', 'b-owner')).toMatchObject({ status: 404 })
    // The send moves are not on the core's door for screens.
    const door = await t.call('POST', '/ops/brandbase/post.tiktok_start', {
      brand: 'casa',
      id: 'tp1',
    })
    expect(door).toMatchObject({ status: 404, data: { code: 'OP_NOT_FOUND' } })
    expect(t.tiktok.uploads).toEqual([])
  })

  it('revokes the grant and forgets the account on disconnect, even when the revoke fails', async () => {
    const t = await setUp()
    await connect(t)
    const res = await t.call('DELETE', '/brands/casa/tiktok')
    expect(res).toMatchObject({ status: 200, data: { revoked: true } })
    expect(t.tiktok.state.revoked).toEqual(['access:open-casa:1'])
    expect(await t.accounts()).toEqual([])
    expect((await t.stateOf('casa')).tiktok).toBeNull()

    // A dead refresh token: the revoke cannot run, and the account goes all the same.
    await connect(t)
    const [row] = await t.accounts()
    const sealed = t.tiktok.app.sealTokens(
      { access: 'access:open-casa:x', refresh: 'refresh:open-casa:dead', expiresAt: 0 },
      `tiktok:casa:${row!.account_id}`,
    )
    await t.db.query(`update brandbase.accounts set tokens = $1`, [sealed])
    expect((await t.call('DELETE', '/brands/casa/tiktok')).data).toEqual({ revoked: false })
    expect(await t.accounts()).toEqual([])
  })
})

describe('TikTok settings', () => {
  const key = Buffer.alloc(32, 1).toString('base64')
  it('sets TikTok up only with its three variables and the token key', () => {
    expect(platformsFromEnv({}).tiktok).toBeUndefined()
    const full = {
      TIKTOK_CLIENT_KEY: 'k',
      TIKTOK_CLIENT_SECRET: 's',
      TIKTOK_REDIRECT_URL: 'https://brandbase.test/connect/tiktok',
      TOKEN_ENCRYPTION_KEY: key,
    }
    expect(platformsFromEnv(full).tiktok).toBeDefined()
    expect(() => platformsFromEnv({ ...full, TIKTOK_REDIRECT_URL: '' })).toThrow(
      'TIKTOK_REDIRECT_URL: TikTok needs all its variables',
    )
    expect(() => platformsFromEnv({ ...full, TOKEN_ENCRYPTION_KEY: '' })).toThrow(
      'TOKEN_ENCRYPTION_KEY: TikTok needs all its variables',
    )
  })
})
