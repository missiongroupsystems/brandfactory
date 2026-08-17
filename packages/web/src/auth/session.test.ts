import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SessionModule from './session'
import type * as StoreModule from './store'

type AuthChangeHandler = (event: string, session: { access_token: string } | null) => void

const supa = vi.hoisted(() => ({
  clientsCreated: 0,
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    supa.clientsCreated++
    return {
      auth: {
        getSession: supa.getSession,
        onAuthStateChange: supa.onAuthStateChange,
        signOut: supa.signOut,
      },
    }
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

describe('signOut', () => {
  beforeEach(() => {
    sessionStorage.clear()
    supa.clientsCreated = 0
    supa.getSession.mockReset()
    supa.onAuthStateChange.mockReset()
    supa.signOut.mockReset()
    supa.signOut.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('revokes the Supabase session before it clears the local token', async () => {
    // The order is the whole function. Clearing the store first redirects to
    // `/login`, whose provider calls `getSession()` — and a session that is
    // still alive signs the user straight back in.
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'live', userId: 'u1' })

    let tokenWhenRevoked: string | null = null
    supa.signOut.mockImplementation(() => {
      tokenWhenRevoked = useAuthStore.getState().token
      return Promise.resolve({ error: null })
    })

    await session.signOut()

    expect(tokenWhenRevoked).toBe('live')
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().userId).toBeNull()
    expect(sessionStorage.getItem('bf_token')).toBeNull()
  })

  it('retries locally when the first sign-out cannot reach the network', async () => {
    // Both calls are `scope: 'local'`. The first still needs the network to
    // reach GoTrue and revoke the refresh token; the retry only has to empty
    // localStorage, which is the part that must happen before the store is
    // cleared.
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'live', userId: 'u1' })
    supa.signOut.mockResolvedValueOnce({ error: { message: 'offline' } })

    await session.signOut()

    expect(supa.signOut).toHaveBeenNthCalledWith(1, { scope: 'local' })
    expect(supa.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' })
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('never signs the person out of the other apps sharing the issuer', async () => {
    // This assertion used to read `toHaveBeenNthCalledWith(1)` — no arguments,
    // which is `scope: 'global'` by GoTrue's default. It was correct only while
    // BrandFactory owned its own issuer. Under Passport's hosted login a
    // member's session comes from PASSPORT's project, shared by every consumer
    // in the suite, so the default revokes their session in every other Mission
    // Systems app and in Passport's console — and does it up to a token lifetime
    // later, at their next refresh, where nobody attributes it to this button.
    //
    // `auth/signout-scope.test.ts` sweeps the source for the same rule; this one
    // pins the behaviour of the call site that exists.
    const { session } = await load(true)
    supa.signOut.mockResolvedValue({ error: null })

    await session.signOut()

    for (const call of supa.signOut.mock.calls) {
      expect(call[0]).toEqual({ scope: 'local' })
    }
  })

  it('clears the store even when both sign-out calls reject', async () => {
    // Offline and unable to revoke anything: the local session is the one the
    // user asked to end, and it must end.
    const { session, useAuthStore } = await load(true)
    useAuthStore.setState({ token: 'live', userId: 'u1' })
    supa.signOut.mockRejectedValue(new Error('network down'))

    await session.signOut()

    expect(useAuthStore.getState().token).toBeNull()
  })

  it('clears the store without a provider call when Supabase is not configured', async () => {
    // Local dev auth is a static server-printed token with no session behind
    // it and nothing to revoke.
    const { session, useAuthStore } = await load(false)
    useAuthStore.setState({ token: 'dev-token', userId: 'u1' })

    await session.signOut()

    expect(supa.signOut).not.toHaveBeenCalled()
    expect(useAuthStore.getState().token).toBeNull()
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
