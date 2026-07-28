import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SessionModule from './session'
import type * as StoreModule from './store'

type AuthChangeHandler = (event: string, session: { access_token: string } | null) => void

const supa = vi.hoisted(() => ({
  clientsCreated: 0,
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    supa.clientsCreated++
    return { auth: { getSession: supa.getSession, onAuthStateChange: supa.onAuthStateChange } }
  },
}))

// `session.ts` reads its env at module scope and holds the client + the
// once-per-process sync flag there, so every test loads a fresh module graph —
// including a fresh store, which the session module closes over.
async function load(configured: boolean): Promise<{
  session: typeof SessionModule
  useAuthStore: typeof StoreModule.useAuthStore
}> {
  vi.stubEnv('VITE_SUPABASE_URL', configured ? 'https://project.supabase.co' : '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', configured ? 'anon-key' : '')
  vi.resetModules()
  const session = await import('./session')
  const { useAuthStore } = await import('./store')
  return { session, useAuthStore }
}

function sessionOk(accessToken: string) {
  return { data: { session: { access_token: accessToken } }, error: null }
}

describe('getFreshAuthToken', () => {
  beforeEach(() => {
    sessionStorage.clear()
    supa.clientsCreated = 0
    supa.getSession.mockReset()
    supa.onAuthStateChange.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the session access token and syncs it into the store', async () => {
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'stale', userId: 'u1' })
    supa.getSession.mockResolvedValue(sessionOk('refreshed'))

    await expect(session.getFreshAuthToken()).resolves.toBe('refreshed')
    expect(useAuthStore.getState().token).toBe('refreshed')
    expect(sessionStorage.getItem('bf_token')).toBe('refreshed')
  })

  it('preserves userId across a refresh', async () => {
    // The refresh path can't use `setAuth` — it has no fresh identity to pass,
    // and a placeholder would overwrite a correct userId with a wrong one.
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'stale', userId: 'u1' })
    supa.getSession.mockResolvedValue(sessionOk('refreshed'))

    await session.getFreshAuthToken()
    expect(useAuthStore.getState().userId).toBe('u1')
  })

  it('does not touch the store when the token is unchanged', async () => {
    const { session, useAuthStore } = await load(true)
    const setToken = vi.fn()
    useAuthStore.setState({ token: 'same', userId: 'u1', setToken })
    supa.getSession.mockResolvedValue(sessionOk('same'))

    await expect(session.getFreshAuthToken()).resolves.toBe('same')
    expect(setToken).not.toHaveBeenCalled()
  })

  it('de-dupes concurrent callers into a single getSession', async () => {
    // A brand page mounts several queries at once; each asks for a token.
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'stale', userId: 'u1' })
    supa.getSession.mockResolvedValue(sessionOk('refreshed'))

    const all = await Promise.all([
      session.getFreshAuthToken(),
      session.getFreshAuthToken(),
      session.getFreshAuthToken(),
    ])

    expect(all).toEqual(['refreshed', 'refreshed', 'refreshed'])
    expect(supa.getSession).toHaveBeenCalledTimes(1)
  })

  it('starts a new getSession after the previous one settles', async () => {
    // The de-dupe must be per-flight, not a permanent cache — otherwise the
    // first token resolved would be the only token ever sent.
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'stale', userId: 'u1' })
    supa.getSession.mockResolvedValueOnce(sessionOk('t1')).mockResolvedValueOnce(sessionOk('t2'))

    await expect(session.getFreshAuthToken()).resolves.toBe('t1')
    await expect(session.getFreshAuthToken()).resolves.toBe('t2')
    expect(supa.getSession).toHaveBeenCalledTimes(2)
  })

  it('falls back to the stored token when there is no session', async () => {
    // Sending the stored token lets the server be the authority: a genuinely
    // dead token earns a 401 that drives the logout path, and the server log
    // records who it was.
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'stored', userId: 'u1' })
    supa.getSession.mockResolvedValue({ data: { session: null }, error: null })

    await expect(session.getFreshAuthToken()).resolves.toBe('stored')
  })

  it('falls back to the stored token when getSession rejects', async () => {
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'stored', userId: 'u1' })
    supa.getSession.mockRejectedValue(new Error('network down'))

    await expect(session.getFreshAuthToken()).resolves.toBe('stored')
  })

  it('returns the stored token without a session lookup when Supabase is not configured', async () => {
    // Local dev auth is a static server-printed token with nothing to refresh.
    const { session, useAuthStore } = await load(false)
    useAuthStore.setState({ token: 'dev-token', userId: 'u1' })

    await expect(session.getFreshAuthToken()).resolves.toBe('dev-token')
    expect(supa.clientsCreated).toBe(0)
    expect(supa.getSession).not.toHaveBeenCalled()
  })
})

describe('startSessionSync', () => {
  beforeEach(() => {
    sessionStorage.clear()
    supa.clientsCreated = 0
    supa.getSession.mockReset()
    supa.onAuthStateChange.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('writes a background-refreshed token into the store', async () => {
    // supabase-js refreshes on its own timer and on tab focus, with nobody
    // calling getFreshAuthToken — the route guards read the store, so the
    // store has to hear about it.
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'old', userId: 'u1' })
    let handler: AuthChangeHandler | undefined
    supa.onAuthStateChange.mockImplementation((fn: AuthChangeHandler) => {
      handler = fn
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    session.startSessionSync()
    handler?.('TOKEN_REFRESHED', { access_token: 'new' })

    expect(useAuthStore.getState().token).toBe('new')
  })

  it('logs out on SIGNED_OUT', async () => {
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'old', userId: 'u1' })
    let handler: AuthChangeHandler | undefined
    supa.onAuthStateChange.mockImplementation((fn: AuthChangeHandler) => {
      handler = fn
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    session.startSessionSync()
    handler?.('SIGNED_OUT', null)

    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().userId).toBeNull()
  })

  it('subscribes at most once across repeat calls', async () => {
    // StrictMode mounts effects twice; a second subscription doubles every
    // store write for the life of the tab.
    const { session } = await load(true)
    supa.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })

    session.startSessionSync()
    session.startSessionSync()
    session.startSessionSync()

    expect(supa.onAuthStateChange).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when Supabase is not configured', async () => {
    const { session } = await load(false)
    session.startSessionSync()
    expect(supa.onAuthStateChange).not.toHaveBeenCalled()
  })
})
