/**
 * The link to the core. Off unless `NEXT_PUBLIC_CORE_URL` is set: the demo then runs on its static
 * data exactly as before, and every function here does nothing.
 *
 * With it on, the stores stay synchronous and optimistic, as they always were: a change shows at
 * once, and its request joins one queue, so the server sees changes in the order the person made
 * them (an idea is made before it is planned). A refused or failed request says so and reloads
 * that brand from the server, which puts the screen back to what is stored.
 */

import { coreCall, guestCall, isAccountRoute, PACK } from './core-routes'
import { setToday } from './dates'

/** The core (`packages/core`): the routes in `core-routes.ts` run there as the pack's moves. */
export const CORE_URL = (process.env.NEXT_PUBLIC_CORE_URL ?? '').replace(/\/$/, '')
export const remote = CORE_URL !== ''

/**
 * A brand's row of a static demo table, in the static demo only. On the core a real brand can
 * share an id with a demo brand, and the demo's invented figures must not show for it.
 */
export const demoOf = <T>(table: Partial<Record<string, T>>, brandId: string): T | undefined =>
  remote ? undefined : table[brandId]

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ── Session ─────────────────────────────────────────────────────────────────────────────────

interface Session {
  access: string
  refresh?: string
  /** Epoch seconds. */
  expires?: number
  /** A first sign-in: the account still has the password an admin gave it. */
  needsPassword?: boolean
  /** The name saved on the profile page since this token was issued. */
  name?: string
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

/** The session token's claims; the dev sign-in's token is the id, with none. */
function claims(session: Session): { email?: unknown; user_metadata?: { name?: unknown } } | null {
  const parts = session.access.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
      email?: unknown
      user_metadata?: { name?: unknown }
    }
  } catch {
    return null
  }
}

/** The signed-in person's email, from the token's claims; the dev sign-in's token is the id. */
export function sessionEmail(): string {
  const session = readSession()
  if (!session) return ''
  if (session.access.split('.').length !== 3) return session.access
  const email = claims(session)?.email
  return typeof email === 'string' ? email : ''
}

/** The name the person gave on their profile page (Supabase `user_metadata.name`), or ''. */
function sessionName(): string {
  const session = readSession()
  if (!session) return ''
  if (session.name !== undefined) return session.name
  const name = claims(session)?.user_metadata?.name
  return typeof name === 'string' ? name.trim() : ''
}

/** True when sign-in goes through Supabase; otherwise the core runs dev sign-in (an id). */
export const passwordSignIn = SUPABASE_URL !== ''

/** True on a first sign-in: the person sets a password of their own before anything else. */
export const needsPassword = () => readSession()?.needsPassword === true

/**
 * Sets the person's own password on their first sign-in, and marks the account so it is not
 * asked again (`user_metadata.password_set`). A refusal is a `RemoteError` whose code is
 * Supabase's own (`weak_password`, `same_password`, `reauthentication_needed`, …).
 */
export async function setPassword(password: string): Promise<void> {
  await updateUser({ password, data: { password_set: true } }, 'The password was not set.')
  const session = readSession()
  if (session) writeSession({ ...session, needsPassword: false })
}

/**
 * Saves the person's own name on their Supabase account (`user_metadata.name`; the other keys,
 * such as `password_set`, stay). The core's users table keeps the name an admin gave.
 */
export async function saveName(name: string): Promise<void> {
  await updateUser({ data: { name } }, 'The name was not saved.')
  const session = readSession()
  if (session) writeSession({ ...session, name })
  if (account) {
    account = { ...account, user: { ...account.user, name: name || account.coreName } }
    // Only the person's listeners: the brand listeners would put back the brands as last loaded.
    userListeners.forEach((l) => l(account!.user))
  }
}

/** Changes the signed-in person's own Supabase account. A refusal keeps Supabase's own code. */
async function updateUser(body: object, failed: string): Promise<void> {
  const bearer = await freshToken()
  // The session ended while the screen was up (a refresh refused): nothing to change it as.
  if (!bearer) throw new RemoteError(401, 'SIGN_IN', 'Sign in again, then try again.')
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'content-type': 'application/json',
      authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error_code?: string
      error?: string
      msg?: string
      error_description?: string
    } | null
    throw new RemoteError(
      res.status,
      data?.error_code ?? data?.error ?? 'ACCOUNT',
      data?.msg ?? data?.error_description ?? failed,
    )
  }
}

async function supabaseToken(grant: 'password' | 'refresh_token', body: object): Promise<Session> {
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
    user?: { user_metadata?: { password_set?: unknown } }
  }
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: data.expires_at,
    // An account an admin made in the dashboard carries no mark until the person sets a password.
    needsPassword: data.user ? data.user.user_metadata?.password_set !== true : false,
  }
}

/**
 * Signs in and checks the core answers the account before keeping the session. A person the core
 * knows in no company is signed in all the same: the app shows them that state (`RemoteSync`).
 */
export async function signIn(email: string, password: string) {
  const session = passwordSignIn
    ? await supabaseToken('password', { email, password })
    : { access: email.trim() }
  writeSession(session)
  try {
    await request('GET', '/me')
  } catch (err) {
    if (noAccess(err)) return
    writeSession(null)
    throw err
  }
}

/**
 * The core's answer to a signed-in person it has no place for yet: no principal (403
 * `NO_ACCOUNT`), no loadout (403 `FORBIDDEN`), no account in the pack (404 `NOT_FOUND`), or a
 * deactivated one. An admin adds them; the app waits.
 */
export function noAccess(err: unknown): boolean {
  return (
    err instanceof RemoteError &&
    (err.status === 403 || err.status === 404) &&
    NO_ACCESS.includes(err.code)
  )
}
const NO_ACCESS = ['NO_ACCOUNT', 'FORBIDDEN', 'NOT_FOUND', 'ACCOUNT_DEACTIVATED']

/** True once the account is loaded and reaches no brand and no company: nothing to show yet. */
export const accountEmpty = () =>
  account !== null && account.brands.length === 0 && account.companies.length === 0

export function signOut() {
  writeSession(null)
  // The next person's account loads afresh; nothing of this one's stays.
  account = null
}

/** Signs out with a full page load: nothing of this account's brands or posts stays in memory. */
export function leave() {
  signOut()
  window.location.assign('/sign-in')
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

const MOVE_NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

/** The person's token, for a request the page makes to another service (Bubbles). */
export const token = freshToken

/** The person's yes to what a move sends, recorded on the core before the move runs. */
export async function approve(tool: string, input: unknown): Promise<void> {
  // The name came from the model: only the shape of a move name (`post.create_draft`) may go
  // into the path.
  if (!MOVE_NAME.test(tool))
    throw new RemoteError(400, 'BAD_MOVE', 'That is not a move Brand base knows.')
  const bearer = await freshToken()
  await answer(
    `${CORE_URL}/approve/${PACK}/${encodeURIComponent(tool)}`,
    'POST',
    input,
    bearer ? { authorization: `Bearer ${bearer}` } : {},
  )
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
  const core = coreCall(method, path, body)
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
  if (isAccountRoute(method, path)) {
    return answer<T>(`${CORE_URL}${path}`, method, body, { ...auth, ...headers })
  }
  throw new RemoteError(501, 'NO_MOVE', `No move on the core for ${method} ${path}.`)
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
  const guest = guestCall(method, path, body)
  if (!guest) throw new RemoteError(501, 'NO_MOVE', `No guest move on the core for ${path}.`)
  return answer<T>(`${CORE_URL}/guest/${PACK}/${guest.op}`, 'POST', guest.input, {})
}

// ── The write queue ─────────────────────────────────────────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve()
/** Changes queued or on their way: a load waits until there are none. */
let pending = 0
let muted = 0
/** One thing a message offers to do, such as Undo. */
export interface MessageAction {
  label: string
  run: () => void
}
const problems = new Set<(message: string, action?: MessageAction) => void>()

/** Hears each refused write, in words; the app shows it briefly. */
export function onProblem(listener: (message: string, action?: MessageAction) => void) {
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

/**
 * Shows a short line without a reload: a problem on a page with no brand to reload (the guest
 * page), or what a change did, with one action such as Undo.
 */
export function report(message: string, action?: MessageAction) {
  problems.forEach((l) => l(message, action))
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
export type BrandState = Record<string, any> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brand: { id: string; name?: string; tiktokDefaults?: any }
}

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

/** A brand as `brand.list` answers it. */
export interface CoreBrand {
  id: string
  orgId: string
  name: string
  handle: string
  line: string
  linked: string[]
  timezone: string
  position: number
}

/** One of the caller's companies, with their role in it (`account.me`). */
export interface Company {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
}

interface Account {
  brands: CoreBrand[]
  companies: Company[]
  /** The signed-in person, for the header's account menu: their own name first, else the core's. */
  user: { name: string; email: string; avatar?: string | null }
  /** The name the core holds, as an admin set it. */
  coreName: string
}

let account: Account | null = null
const accountListeners = new Set<(account: Account) => void>()

/** A brand's own timezone, as the core keeps it; Singapore until the account has loaded. */
export const timezoneOf = (brandId: string) =>
  account?.brands.find((b) => b.id === brandId)?.timezone ?? 'Asia/Singapore'

/** The brands and companies the caller reaches: called on each load, and at once if loaded. */
export function onAccount(listener: (account: Account) => void) {
  accountListeners.add(listener)
  if (account) listener(account)
  return () => {
    accountListeners.delete(listener)
  }
}

type User = Account['user']
const userListeners = new Set<(user: User) => void>()

/** The signed-in person: called on each load and each saved name, and at once if loaded. */
export function onUser(listener: (user: User) => void) {
  userListeners.add(listener)
  if (account) listener(account.user)
  return () => {
    userListeners.delete(listener)
  }
}

// ── Platforms ───────────────────────────────────────────────────────────────────────────────

/** The platforms the server has an app set up for (`GET /platforms`); none until it answers. */
let platforms: Record<string, boolean> = {}

/** True when the server can sign a brand in to this platform (only `pinterest` so far). */
export const platformOn = (platform: string) => platforms[platform] === true

/**
 * Asks the server which platforms it can sign in to. A core with no host beside it has no such
 * route (404). Whatever goes wrong, the app still loads: no platform is offered until the next
 * load, so a platform is never shown as connectable by mistake.
 */
async function loadPlatforms() {
  try {
    platforms = await answer<Record<string, boolean>>(`${CORE_URL}/platforms`, 'GET', undefined, {})
  } catch (err) {
    platforms = {}
    if (!(err instanceof RemoteError && err.status === 404)) console.error('platforms', err)
  }
}

export async function loadAll() {
  // The platforms first: the stores read them when each brand's state comes in.
  const [brands, me] = await Promise.all([
    request<CoreBrand[]>('GET', '/brands'),
    request<{
      companies?: Company[]
      user?: { name?: string; email?: string; avatar?: string | null }
    }>('GET', '/me'),
    loadPlatforms(),
  ])
  // One brand refused (gone meanwhile, or walled off) is not the account refused: it must not
  // read as "Not in a company yet" (`noAccess`).
  await Promise.all(
    brands.map((b) =>
      loadBrand(b.id).catch((err: unknown) => {
        throw new Error(`brand ${b.id} did not load`, { cause: err })
      }),
    ),
  )
  // After the states: a store asked for a brand's kit finds it loaded.
  // A core still on brandbase 1.4.0 answers no companies: the caller then manages none.
  const coreName = me.user?.name?.trim() ?? ''
  account = {
    brands,
    companies: me.companies ?? [],
    user: {
      name: sessionName() || coreName,
      email: me.user?.email || sessionEmail(),
      avatar: avatarAddress(me.user?.avatar),
    },
    coreName,
  }
  accountListeners.forEach((l) => l(account!))
  userListeners.forEach((l) => l(account!.user))
  return brands.map((b) => b.id)
}

/**
 * The core keeps a picture as its path on the core (`/files/<signature>/<key>`), never a host:
 * the address is always this core's.
 */
const avatarAddress = (path: string | null | undefined) => (path ? `${CORE_URL}${path}` : null)

/** Puts the person's picture on the account and tells their listeners. */
function showAvatar(avatar: string | null) {
  if (!account) return
  account = { ...account, user: { ...account.user, avatar } }
  userListeners.forEach((l) => l(account!.user))
}

/**
 * Uploads the person's own profile picture (the cropped square) and makes it theirs: the core
 * makes the file's record and key, the browser writes the bytes to storage, then the core takes
 * the file's address. Returns the address the header now shows.
 */
export async function uploadAvatar(picture: Blob): Promise<string> {
  const made = await request<{
    src: string
    upload: { url: string; headers: Record<string, string> }
  }>('POST', '/me/avatar', { mime: picture.type, bytes: picture.size })
  const put = await fetch(made.upload.url, {
    method: 'PUT',
    headers: made.upload.headers,
    body: picture,
  })
  if (!put.ok) throw new RemoteError(put.status, 'UPLOAD', 'The photo did not upload.')
  const set = await request<{ avatar: string | null }>('PUT', '/me/avatar', { src: made.src })
  const address = avatarAddress(set.avatar)
  showAvatar(address)
  return address ?? ''
}

/** Takes the person's profile picture away; the header shows their initials again. */
export async function removeAvatar(): Promise<void> {
  await request('PUT', '/me/avatar', { src: null })
  showAvatar(null)
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
