import { createHmac } from 'node:crypto'
import { deriveKey, openExpiring, seal, sealExpiring, unseal } from './crypto'

const VERSION = 'v26.0'
export const GRAPH = `https://graph.facebook.com/${VERSION}`
const DIALOG = `https://www.facebook.com/${VERSION}/dialog/oauth`
/** How long a connect link, and the list of Pages it answers with, stay good. */
const TEN_MINUTES = 10 * 60 * 1000
/** The Page fields the webhook takes (the app's Webhooks settings select the same). */
export const PAGE_FIELDS = ['messages', 'feed']

export interface MetaConfig {
  appId: string
  appSecret: string
  /** The Facebook Login for Business configuration that lists the permissions. */
  configId: string
  /** The web app's `/connect/meta`, as registered on the Meta app. */
  redirectUrl: string
  /** `TOKEN_ENCRYPTION_KEY`, decoded. Changing it makes the stored tokens unreadable. */
  masterKey: Buffer
  fetch?: typeof fetch
}

/** A Facebook Page the person may pick, with its Instagram business account when it has one. */
export interface MetaPage {
  id: string
  name: string
  /** The Page token. Read with a long-lived user token, it does not expire. */
  token: string
  igUserId: string | null
  igUsername: string | null
}

/** Who started a sign-in, and for which brand. */
export type Started = { userId: string; brandId: string }

/** The token is dead (Meta's code 190): someone must connect again. */
export class MetaReconnect extends Error {}

/** Meta refused, in its own words; `code` is Meta's error code. */
export class MetaError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    /** Meta's `is_transient`: the same call may work later. */
    readonly transient = false,
  ) {
    super(message)
  }
}

interface GraphError {
  error?: {
    message: string
    code: number
    error_subcode?: number
    error_user_msg?: string
    is_transient?: boolean
  }
}

/**
 * The Graph API for the Facebook Page (and its Instagram account) each brand links. Facebook Login
 * for Business: the permissions live in the configuration `configId` names, so the dialog sends
 * `config_id` and no `scope`. Every call with a token carries `appsecret_proof`, so a token that
 * leaks is of no use without the app secret.
 */
export function metaApp(config: MetaConfig) {
  const doFetch = config.fetch ?? fetch
  const stateKey = deriveKey(config.masterKey, 'meta-state')
  const choiceKey = deriveKey(config.masterKey, 'meta-choice')
  const tokenKey = deriveKey(config.masterKey, 'meta-tokens')
  const proof = (token: string) =>
    createHmac('sha256', config.appSecret).update(token).digest('hex')

  /** One Graph call: POST with a form body, GET and DELETE with query parameters. */
  async function graph<T>(
    path: string,
    params: Record<string, string>,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
  ): Promise<T> {
    const all = new URLSearchParams(params)
    if (params.access_token) all.set('appsecret_proof', proof(params.access_token))
    // A minute at most for one call.
    const signal = AbortSignal.timeout(60_000)
    const res =
      method === 'POST'
        ? await doFetch(`${GRAPH}${path}`, { method, body: all, signal })
        : await doFetch(`${GRAPH}${path}?${all}`, { method, signal })
    const body = (await res.json().catch(() => ({}))) as T & GraphError
    if (body.error) {
      // 190 is "invalid OAuth access token": expired, revoked, or the password changed.
      if (body.error.code === 190) throw new MetaReconnect(body.error.message)
      throw new MetaError(
        body.error.error_user_msg || body.error.message,
        body.error.code,
        body.error.is_transient === true,
      )
    }
    if (!res.ok) throw new MetaError(`HTTP ${res.status}`, null)
    return body
  }

  return {
    graph,

    authorizeUrl(state: string) {
      const params = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: config.redirectUrl,
        state,
        config_id: config.configId,
        response_type: 'code',
      })
      return `${DIALOG}?${params}`
    },

    sealState: (value: Started, now: number) =>
      sealExpiring(stateKey, 'meta-state', value, now + TEN_MINUTES),
    openState: (sealed: string, now: number) =>
      openExpiring<Started>(stateKey, 'meta-state', sealed, now),

    /** The Pages a sign-in found, sealed: their tokens reach the browser only like this. */
    sealChoice: (value: Started & { pages: MetaPage[] }, now: number) =>
      sealExpiring(choiceKey, 'meta-choice', value, now + TEN_MINUTES),
    openChoice: (sealed: string, now: number) =>
      openExpiring<Started & { pages: MetaPage[] }>(choiceKey, 'meta-choice', sealed, now),

    /** `bound` names the row (platform, brand and account): the token opens only there. */
    sealToken: (pageToken: string, bound: string) => seal(tokenKey, pageToken, bound),
    openToken: (sealed: string, bound: string) => unseal(tokenKey, sealed, bound),

    /**
     * The code from the redirect, for the Pages the person manages, each with its Page token and
     * its Instagram business account. The code becomes a user token, then a long-lived one, so
     * the Page tokens read with it do not expire.
     */
    async pagesFor(code: string): Promise<MetaPage[]> {
      const credentials = { client_id: config.appId, client_secret: config.appSecret }
      const short = await graph<{ access_token: string }>('/oauth/access_token', {
        ...credentials,
        redirect_uri: config.redirectUrl,
        code,
      })
      const long = await graph<{ access_token: string }>('/oauth/access_token', {
        ...credentials,
        grant_type: 'fb_exchange_token',
        fb_exchange_token: short.access_token,
      })
      const pages = await graph<{
        data?: {
          id: string
          name: string
          access_token?: string
          instagram_business_account?: { id: string; username?: string }
        }[]
      }>('/me/accounts', {
        fields: 'id,name,access_token,instagram_business_account{id,username}',
        limit: '100',
        access_token: long.access_token,
      })
      return (pages.data ?? []).flatMap((p) =>
        p.access_token
          ? [
              {
                id: p.id,
                name: p.name,
                token: p.access_token,
                igUserId: p.instagram_business_account?.id ?? null,
                igUsername: p.instagram_business_account?.username ?? null,
              },
            ]
          : [],
      )
    },

    /** Turns the Page's webhooks on for this app (needs `pages_manage_metadata`). */
    subscribe: (pageId: string, token: string) =>
      graph<{ success?: boolean }>(
        `/${pageId}/subscribed_apps`,
        { subscribed_fields: PAGE_FIELDS.join(','), access_token: token },
        'POST',
      ),

    /**
     * Hands Meta a video to fetch from our storage, for a Page Reel or a Page video story: the
     * `upload_url` (on rupload.facebook.com) that the session's start answered.
     */
    async upload(uploadUrl: string, token: string, fileUrl: string, timeoutMs = 120_000) {
      if (new URL(uploadUrl).hostname !== 'rupload.facebook.com') {
        throw new MetaError('the upload address is not Meta’s', null)
      }
      const res = await doFetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `OAuth ${token}`, file_url: fileUrl },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 120_000)),
      })
      const body = (await res.json().catch(() => ({}))) as { success?: boolean } & GraphError
      if (body.error) throw new MetaError(body.error.message, body.error.code)
      if (!res.ok || body.success !== true) throw new MetaError(`upload HTTP ${res.status}`, null)
    },

    /** Turns them off: the app leaves the Page's list of subscribed apps. */
    unsubscribe: (pageId: string, token: string) =>
      graph<{ success?: boolean }>(`/${pageId}/subscribed_apps`, { access_token: token }, 'DELETE'),
  }
}

export type MetaApp = ReturnType<typeof metaApp>
