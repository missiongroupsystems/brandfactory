/**
 * The link to the BrandBase API. Off unless `NEXT_PUBLIC_API_URL` is set: the demo then runs on
 * its static data exactly as before, and every function here does nothing.
 *
 * With it on, the stores stay synchronous and optimistic, as they always were: a change shows at
 * once, and its request joins one queue, so the server sees changes in the order the person made
 * them (an idea is made before it is planned). A refused or failed request says so and reloads
 * that brand from the server, which puts the screen back to what is stored.
 */

import { coreCall, guestCall, PACK } from './core-routes'
import { setToday } from './dates'

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '')
/**
 * The core (`packages/core`), when set: the routes in `core-routes.ts` run there as the
 * `brandbase` pack's moves, and every other route still goes to `API_URL`.
 */
export const CORE_URL = (process.env.NEXT_PUBLIC_CORE_URL ?? '').replace(/\/$/, '')
export const remote = API_URL !== '' || CORE_URL !== ''

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ── Session ─────────────────────────────────────────────────────────────────────────────────

interface Session {
  access: string
  refresh?: string
  /** Epoch seconds. */
  expires?: number
}

const SESSION_KEY = 'brandbase.session'

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Private mode: the session lasts as long as the page.
  }
}

export const signedIn = () => readSession() !== null

/** True when sign-in goes through Supabase; otherwise the API runs dev sign-in (an id). */
export const passwordSignIn = SUPABASE_URL !== ''

async function supabaseToken(grant: 'password' | 'refresh_token', body: object) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new RemoteError(res.status, 'SIGN_IN', 'That email and password did not work.')
  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_at: number
  }
  return { access: data.access_token, refresh: data.refresh_token, expires: data.expires_at }
}

/** Signs in and checks the account can reach Brand Base before keeping the session. */
export async function signIn(email: string, password: string) {
  const session = passwordSignIn
    ? await supabaseToken('password', { email, password })
    : { access: email.trim() }
  writeSession(session)
  try {
    await request('GET', '/me')
  } catch (err) {
    writeSession(null)
    throw err
  }
}

export function signOut() {
  writeSession(null)
}

async function freshToken(): Promise<string | null> {
  const session = readSession()
  if (!session) return null
  const soon = Date.now() / 1000 + 60
  if (session.refresh && session.expires && session.expires < soon) {
    try {
      const next = await supabaseToken('refresh_token', { refresh_token: session.refresh })
      writeSession(next)
      return next.access
    } catch {
      writeSession(null)
      return null
    }
  }
  return session.access
}

// ── Requests ────────────────────────────────────────────────────────────────────────────────

export class RemoteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const token = await freshToken()
  const auth: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
  const core = CORE_URL ? coreCall(method, path, body) : null
  if (core) {
    if (core.approveFirst) {
      await answer(`${CORE_URL}/approve/${PACK}/${core.op}`, 'POST', core.input, auth)
    }
    // Schedule carries the person's yes to each account's send itself (`post.schedule`).
    return answer<T>(`${CORE_URL}/ops/${PACK}/${core.op}`, 'POST', core.input, {
      ...auth,
      ...headers,
    })
  }
  if (!API_URL) {
    throw new RemoteError(501, 'NOT_PORTED', 'This is not on the new backend yet.')
  }
  return answer<T>(`${API_URL}${path}`, method, body, { ...auth, ...headers })
}

/** One request and its answer, or the refusal as a `RemoteError`. */
async function answer<T>(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // A proxy's error page, not the API's answer.
    if (res.ok) throw new RemoteError(res.status, 'BAD_ANSWER', 'The server gave an odd answer.')
  }
  if (!res.ok) {
    if (res.status === 401) {
      // The session ended: back to sign-in, where a new one starts.
      writeSession(null)
      if (typeof window !== 'undefined') window.location.assign('/sign-in')
    }
    throw new RemoteError(res.status, data?.code ?? 'ERROR', data?.message ?? res.statusText)
  }
  return data as T
}

/** A request with no session, for the guest share page. */
export async function guestRequest<T = unknown>(method: string, path: string, body?: unknown) {
  const guest = CORE_URL ? guestCall(method, path, body) : null
  if (guest) return answer<T>(`${CORE_URL}/guest/${PACK}/${guest.op}`, 'POST', guest.input, {})
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new RemoteError(res.status, data?.code ?? 'ERROR', data?.message ?? res.statusText)
  }
  return data as T
}

// ── The write queue ─────────────────────────────────────────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve()
/** Changes queued or on their way: a load waits until there are none. */
let pending = 0
let muted = 0
const problems = new Set<(message: string) => void>()

/** Hears each refused write, in words; the app shows it briefly. */
export function onProblem(listener: (message: string) => void) {
  problems.add(listener)
  return () => {
    problems.delete(listener)
  }
}

/** The server's reason as a sentence: "this post is posted…" → "This post is posted…." */
function sentence(err: unknown): string {
  const text = err instanceof Error && err.message ? err.message : 'Something did not save'
  const capital = text.charAt(0).toUpperCase() + text.slice(1)
  return /[.!?]$/.test(capital) ? capital : `${capital}.`
}

/** Shows a problem without a reload, for a page with no brand to reload (the guest page). */
export function report(message: string) {
  problems.forEach((l) => l(message))
}

/**
 * Sends a change after every change made before it. A refusal is shown, and the brand reloads
 * from the server so the screen matches what is stored.
 */
export function push(brandId: string, send: () => Promise<unknown>) {
  void sent(brandId, send)
}

/** `push`, for a caller that waits: the refusal in words, or null once the change is stored. */
export function sent(brandId: string, send: () => Promise<unknown>): Promise<string | null> {
  if (!remote || muted > 0) return Promise.resolve(null)
  pending++
  const done = chain
    .then(send)
    .then(
      () => null,
      (err: unknown) => {
        const words = sentence(err)
        problems.forEach((l) => l(words))
        // Outside the queue: the reload waits for the changes made after this one.
        void loadBrand(brandId).catch(() => undefined)
        return words
      },
    )
    .finally(() => pending--)
  chain = done
  return done
}

/** Runs local changes without sending them; the caller sends its own requests. */
export function quietly<T>(change: () => T): T {
  muted++
  try {
    return change()
  } finally {
    muted--
  }
}

/** Resolves once every queued change has been sent. */
export const settled = () => chain.then(() => undefined)

/** The brand on screen: an upload belongs to it. Set by `BrandProvider`. */
let activeBrand = ''
export const setActiveBrand = (id: string) => {
  activeBrand = id
}
export const currentBrand = () => activeBrand

/**
 * A new id for a record made in the browser (decision 1): a version 4 UUID. Made from
 * `getRandomValues`, which, unlike `randomUUID`, also exists on a plain-http page (a phone on the
 * dev server over the network).
 */
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ── Loading a brand ─────────────────────────────────────────────────────────────────────────

/** What `GET /brands/:id/state` answers; each store reads its own part. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BrandState = Record<string, any> & { brand: { id: string; tiktokDefaults?: any } }

const states = new Map<string, BrandState>()
const hydrators = new Set<(brandId: string, state: BrandState) => void>()

/** A store's way in: called for every brand loaded, and at once for the ones loaded already. */
export function onState(hydrate: (brandId: string, state: BrandState) => void) {
  hydrators.add(hydrate)
  states.forEach((state, brandId) => hydrate(brandId, state))
  return () => {
    hydrators.delete(hydrate)
  }
}

/**
 * Loads a brand and hands it to the stores, once no change is queued: a state read while a change
 * was on its way would put back what the screen already moved past.
 */
export async function loadBrand(brandId: string) {
  let state: BrandState
  do {
    await settled()
    state = await request<BrandState>('GET', `/brands/${brandId}/state`)
  } while (pending > 0)
  states.set(brandId, state)
  // The brand's today, before the stores build their weeks from it.
  if (typeof state.today === 'string') setToday(state.today)
  quietly(() => hydrators.forEach((h) => h(brandId, state)))
  return state
}

export async function loadAll() {
  const brands = await request<{ id: string }[]>('GET', '/brands')
  await Promise.all(brands.map((b) => loadBrand(b.id)))
  return brands.map((b) => b.id)
}

// ── Files ───────────────────────────────────────────────────────────────────────────────────

/**
 * Uploads a file straight to storage and returns its stable address. The `#video` or `#photo`
 * fragment carries the kind, as the demo's media URLs do.
 */
export async function upload(
  brandId: string,
  file: File,
  meta: { durationS?: number } = {},
): Promise<string> {
  const made = await request<{
    src: string
    upload: { url: string; headers: Record<string, string> }
  }>('POST', `/brands/${brandId}/media`, {
    id: newId(),
    mime: file.type || 'application/octet-stream',
    name: file.name,
    bytes: file.size,
    ...meta,
  })
  const put = await fetch(made.upload.url, {
    method: 'PUT',
    headers: made.upload.headers,
    body: file,
  })
  if (!put.ok) throw new RemoteError(put.status, 'UPLOAD', 'The file did not upload.')
  const kind = file.type.startsWith('video/') ? 'video' : 'photo'
  return `${made.src}#${kind}`
}
