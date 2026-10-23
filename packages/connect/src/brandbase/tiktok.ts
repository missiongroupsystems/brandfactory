import { deriveKey, openExpiring, seal, sealExpiring, unseal } from './crypto'

const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/'
const API = 'https://open.tiktokapis.com/v2'
// Upload only: the video lands in the creator's TikTok inbox as a draft, and they finish the post
// in the TikTok app. No Direct Post (`video.publish`).
export const SCOPES = ['user.info.basic', 'video.upload']
/** How long a connect link stays good. */
const STATE_TTL_MS = 10 * 60 * 1000
/**
 * The chunk size of an upload. TikTok takes chunks of 5 to 64 MB, a last chunk up to 128 MB that
 * holds the trailing bytes, and a file under 5 MB whole. A video under 10 MB goes whole; a larger
 * one goes in 10 MB chunks, the last one under 20 MB, so the server holds little at a time.
 */
const CHUNK = 10 * 1024 * 1024
/** The video types TikTok takes. */
const TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
/** The most one upload may take, from the storage read to the last chunk. */
const UPLOAD_MS = 20 * 60 * 1000

export interface TikTokConfig {
  clientKey: string
  clientSecret: string
  /** The web app's `/connect/tiktok`, as registered on the TikTok app. */
  redirectUrl: string
  /** `TOKEN_ENCRYPTION_KEY`, decoded. Changing it makes the stored tokens unreadable. */
  masterKey: Buffer
  fetch?: typeof fetch
}

export interface TikTokTokens {
  access: string
  /** Lasts 365 days; TikTok may hand out a new one on each refresh. */
  refresh: string
  /** Epoch milliseconds, on the server's clock. */
  expiresAt: number
}

/** The token is dead or lacks a grant: someone must connect the account again. */
export class TikTokReconnect extends Error {}

/** TikTok refused, in words for people. Nothing reached the inbox. */
export class TikTokRefused extends Error {}

/** Where TikTok has the video, as `status/fetch` says. */
export type InboxStatus =
  | { status: 'processing' }
  | { status: 'sent' }
  | { status: 'failed'; reason: string }

// The OAuth endpoints answer `{ error: 'invalid_grant', error_description }`; the others answer
// `{ error: { code: 'ok' | ..., message } }`.
type ErrorBody = { error?: string | { code: string; message: string }; error_description?: string }

function errorOf(body: ErrorBody): { code: string; message: string } | null {
  if (!body.error) return null
  if (typeof body.error === 'string') {
    return { code: body.error, message: body.error_description ?? body.error }
  }
  return body.error.code === 'ok' ? null : body.error
}

/** TikTok's refusals that a person can act on, in words. Others keep TikTok's own message. */
const WORDS: Record<string, string> = {
  spam_risk_too_many_pending_share:
    'TikTok holds at most 5 drafts from apps in 24 hours. Post or delete the drafts in the TikTok inbox, then try again later.',
  spam_risk_user_banned_from_posting: 'TikTok does not let this account post right now.',
  spam_risk_too_many_posts: 'This TikTok account sent too many posts through apps today.',
  rate_limit_exceeded: 'TikTok is busy. Try again in a minute.',
  file_format_check_failed: 'TikTok could not read this video. Export it as MP4 (H.264).',
  duration_check_failed: 'TikTok takes videos up to 10 minutes long.',
  frame_rate_check_failed: 'TikTok takes videos at 23 to 60 frames a second.',
  picture_size_check_failed: 'TikTok takes videos from 360 to 4096 pixels on each side.',
  internal: 'TikTok had a problem on its side. Try again.',
  auth_removed: 'The TikTok account took away access. Connect it again.',
}

const words = (code: string, message: string) => WORDS[code] ?? `TikTok: ${message || code}.`

interface TokenResponse {
  open_id: string
  access_token: string
  expires_in: number
  refresh_token: string
  scope?: string
}

/**
 * TikTok Login Kit for web and the Content Posting API's upload (the creator's inbox). The access
 * token lasts 24 hours; the refresh token 365 days, and a refresh may rotate it.
 */
export function tiktokApp(config: TikTokConfig) {
  const doFetch = config.fetch ?? fetch
  const stateKey = deriveKey(config.masterKey, 'tiktok-state')
  const tokenKey = deriveKey(config.masterKey, 'tiktok-tokens')

  async function oauth(path: string, params: Record<string, string>) {
    const res = await doFetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        ...params,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as TokenResponse & ErrorBody
    const error = errorOf(body)
    if (error?.code === 'invalid_grant') throw new TikTokReconnect(error.message)
    if (error || !res.ok) throw new Error(`TikTok ${path}: ${error?.code ?? `HTTP ${res.status}`}`)
    return body
  }

  /** A content call with the account's token. TikTok's refusals come back in words. */
  async function api<T>(access: string, path: string, body: unknown): Promise<T> {
    const res = await doFetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
    const json = (await res.json().catch(() => ({}))) as { data?: T } & ErrorBody
    const error = errorOf(json)
    if (error && ['access_token_invalid', 'scope_not_authorized'].includes(error.code)) {
      throw new TikTokReconnect(error.message)
    }
    if (res.status === 401) throw new TikTokReconnect(`HTTP ${res.status}`)
    if (error) throw new TikTokRefused(words(error.code, error.message))
    if (!res.ok) throw new Error(`TikTok ${path}: HTTP ${res.status}`)
    return json.data as T
  }

  const toTokens = (body: TokenResponse, now: number): TikTokTokens => ({
    access: body.access_token,
    refresh: body.refresh_token,
    expiresAt: now + body.expires_in * 1000,
  })

  return {
    authorizeUrl(state: string) {
      const params = new URLSearchParams({
        client_key: config.clientKey,
        response_type: 'code',
        scope: SCOPES.join(','),
        redirect_uri: config.redirectUrl,
        state,
      })
      return `${AUTHORIZE}?${params}`
    },

    sealState: (value: { userId: string; brandId: string }, now: number) =>
      sealExpiring(stateKey, 'tiktok-state', value, now + STATE_TTL_MS),
    openState: (sealed: string, now: number) =>
      openExpiring<{ userId: string; brandId: string }>(stateKey, 'tiktok-state', sealed, now),

    /** `bound` names the row (brand and account): the tokens open only there. */
    sealTokens: (tokens: TikTokTokens, bound: string) =>
      seal(tokenKey, JSON.stringify(tokens), bound),
    openTokens: (sealed: string, bound: string) =>
      JSON.parse(unseal(tokenKey, sealed, bound)) as TikTokTokens,

    /**
     * The code from the redirect, for the tokens and the account they belong to: its name and
     * picture. A person may turn a scope off on TikTok's screen; without the upload grant nothing
     * here works, so that is refused.
     */
    async exchange(code: string, now: number) {
      const body = await oauth('/oauth/token/', {
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUrl,
      })
      const granted = (body.scope ?? '').split(',')
      if (!SCOPES.every((s) => granted.includes(s))) {
        // Nothing is kept, so the grant goes back too.
        await oauth('/oauth/revoke/', { token: body.access_token }).catch((err: unknown) =>
          console.error('tiktok revoke after a partial grant failed', err),
        )
        throw new TikTokRefused(
          'Allow Brand Base to upload videos on TikTok’s screen, then connect again.',
        )
      }
      const res = await doFetch(`${API}/user/info/?fields=open_id,display_name,avatar_url`, {
        headers: { Authorization: `Bearer ${body.access_token}` },
      })
      const info = (await res.json().catch(() => ({}))) as ErrorBody & {
        data?: { user?: { display_name?: string; avatar_url?: string } }
      }
      const error = errorOf(info)
      if (error || !res.ok) {
        throw new Error(`TikTok /user/info/: ${error?.code ?? `HTTP ${res.status}`}`)
      }
      return {
        accountId: body.open_id,
        name: info.data?.user?.display_name || 'TikTok account',
        avatar: info.data?.user?.avatar_url ?? null,
        tokens: toTokens(body, now),
      }
    },

    async refresh(current: TikTokTokens, now: number) {
      const body = await oauth('/oauth/token/', {
        grant_type: 'refresh_token',
        refresh_token: current.refresh,
      })
      return toTokens(body, now)
    },

    /** Takes back the grant: the app leaves the account's "Manage app permissions" list. */
    async revoke(access: string) {
      await oauth('/oauth/revoke/', { token: access })
    },

    /**
     * Sends one video to the creator's TikTok inbox as a draft (`FILE_UPLOAD`: the bytes stream
     * from our storage one chunk at a time). Answers TikTok's publish id; TikTok goes on
     * processing it after this.
     */
    async sendToInbox(
      access: string,
      video: { url: string; mime: string; bytes: number | null },
    ): Promise<string> {
      if (!TYPES.includes(video.mime)) {
        throw new TikTokRefused('TikTok takes MP4, MOV or WebM videos. Export the video as MP4.')
      }
      // One deadline for the whole upload, under the 30 minutes in which the pack refuses a second
      // send of the post (`post.tiktok_free`).
      const signal = AbortSignal.timeout(UPLOAD_MS)
      const file = await doFetch(video.url, { signal })
      if (!file.ok || !file.body) throw new Error(`storage read: HTTP ${file.status}`)
      const size = Number(file.headers.get('content-length')) || video.bytes || 0
      if (size <= 0) throw new TikTokRefused('The video’s size is unknown. Upload it again.')
      const chunkSize = size < CHUNK ? size : CHUNK
      const chunks = Math.floor(size / chunkSize)

      const init = await api<{ publish_id: string; upload_url: string }>(
        access,
        '/post/publish/inbox/video/init/',
        {
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: size,
            chunk_size: chunkSize,
            total_chunk_count: chunks,
          },
        },
      )

      const read = exactReader(file.body)
      for (let i = 0; i < chunks; i++) {
        const start = i * chunkSize
        const end = i === chunks - 1 ? size : start + chunkSize
        const res = await doFetch(init.upload_url, {
          method: 'PUT',
          // fetch sets Content-Length from the chunk.
          headers: {
            'Content-Type': video.mime,
            'Content-Range': `bytes ${start}-${end - 1}/${size}`,
          },
          body: await read(end - start),
          signal,
        })
        if (!res.ok) throw new Error(`TikTok upload chunk ${i + 1}/${chunks}: HTTP ${res.status}`)
      }
      return init.publish_id
    },

    /** Where TikTok has a video sent to the inbox. */
    async status(access: string, publishId: string): Promise<InboxStatus> {
      const got = await api<{ status: string; fail_reason?: string }>(
        access,
        '/post/publish/status/fetch/',
        { publish_id: publishId },
      )
      if (got.status === 'FAILED') {
        const reason = got.fail_reason ?? ''
        return { status: 'failed', reason: words(reason, reason || 'it did not take the video') }
      }
      // A draft the creator already posted from the inbox comes back as published.
      if (got.status === 'SEND_TO_USER_INBOX' || got.status === 'PUBLISH_COMPLETE') {
        return { status: 'sent' }
      }
      return { status: 'processing' }
    },
  }
}

export type TikTokApp = ReturnType<typeof tiktokApp>

/** Reads a stream in pieces of exactly the sizes asked for: about two chunks held at most. */
function exactReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  let pending: Uint8Array[] = []
  let have = 0
  return async (size: number) => {
    while (have < size) {
      const { done, value } = await reader.read()
      if (done) throw new Error('the video in storage is shorter than its size')
      pending.push(value)
      have += value.byteLength
    }
    const out = new Uint8Array(size)
    let filled = 0
    while (filled < size) {
      const head = pending[0]!
      const take = Math.min(head.byteLength, size - filled)
      out.set(head.subarray(0, take), filled)
      filled += take
      pending =
        take === head.byteLength ? pending.slice(1) : [head.subarray(take), ...pending.slice(1)]
    }
    have -= size
    return out
  }
}
