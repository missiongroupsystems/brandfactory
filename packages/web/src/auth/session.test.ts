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

// ---------------------------------------------------------------------------
// The two issuers, and the property that stops a blip becoming a mass logout
// ---------------------------------------------------------------------------
//
// Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6B.

async function loadWithPassport(): Promise<{
  session: typeof SessionModule
  useAuthStore: typeof StoreModule.useAuthStore
}> {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://own.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'own-anon')
  vi.stubEnv('VITE_PASSPORT_SUPABASE_URL', 'https://passport.supabase.co')
  vi.stubEnv('VITE_PASSPORT_SUPABASE_ANON_KEY', 'passport-anon')
  vi.resetModules()
  const session = await import('./session')
  const { useAuthStore } = await import('./store')
  return { session, useAuthStore }
}

describe('the two issuers', () => {
  beforeEach(() => {
    sessionStorage.clear()
    supa.clientsCreated = 0
    supa.getSession.mockReset()
    supa.onAuthStateChange.mockReset()
    supa.signOut.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds no Passport client until its project is configured', async () => {
    const { session } = await load(true)
    // This is what keeps hosted login dark: with the project absent the login router
    // sends everyone down the app-native branch and nothing here is reachable.
    expect(session.passportSupabase).toBeNull()
    expect(session.sessionClient()).toBe(session.supabase)
  })

  it('builds both clients once Passport’s project is configured', async () => {
    const { session } = await loadWithPassport()
    expect(session.passportSupabase).not.toBeNull()
    // Two DISTINCT clients: a refresh token is redeemable only by the GoTrue that
    // minted it, so one client cannot stand in for the other.
    expect(session.passportSupabase).not.toBe(session.supabase)
  })

  it('picks the client that HOLDS the session, from the recorded issuer', async () => {
    const { session, useAuthStore } = await loadWithPassport()

    useAuthStore.getState().setAuth('t', 'u1', 'app-native')
    expect(session.sessionClient()).toBe(session.supabase)

    useAuthStore.getState().setAuth('t', 'u1', 'passport')
    // Refreshing on the wrong client finds nothing and lets the token expire in place;
    // signing out on the wrong client clears nothing. Both are silent.
    expect(session.sessionClient()).toBe(session.passportSupabase)
  })

  it('remembers the issuer across a reload, and forgets it on logout', async () => {
    const first = await loadWithPassport()
    first.useAuthStore.getState().setAuth('t', 'u1', 'passport')

    // A fresh module graph, as a page reload gives: both clients restore their own
    // sessions independently, so the issuer has to be persisted rather than guessed.
    const reloaded = await loadWithPassport()
    expect(reloaded.useAuthStore.getState().issuer).toBe('passport')
    expect(reloaded.session.sessionClient()).toBe(reloaded.session.passportSupabase)

    reloaded.useAuthStore.getState().logout()
    expect(sessionStorage.getItem('bf_token_issuer')).toBeNull()
  })

  it('answers app-native when nothing is recorded at all', async () => {
    const { useAuthStore } = await loadWithPassport()
    useAuthStore.getState().setAuth('t', 'u1')
    expect(useAuthStore.getState().issuer).toBe('app-native')
  })

  // ⚠️ The one that makes the whole issuer mechanism survive a page load.
  //
  // `AuthBoundary`'s boot probe calls `setAuth(token, id)` with two arguments on EVERY page
  // load of a signed-in app — it is re-confirming a session, and has no way to know which
  // project issued it. A `issuer = 'app-native'` default would therefore rewrite a
  // hosted-login session as app-native on the first reload, after which the refresh and the
  // sign-out both run against the wrong GoTrue.
  //
  // And every symptom is delayed: the reload works, every request works, and about an hour
  // later the person is signed out with nothing logged. Nobody connects that to a reload.
  it('an omitted issuer PRESERVES the recorded one, as the boot probe needs', async () => {
    const { session, useAuthStore } = await loadWithPassport()
    useAuthStore.getState().setAuth('t1', 'u1', 'passport')

    // Exactly the boot probe's call: a fresh token, the same person, no issuer.
    useAuthStore.getState().setAuth('t2', 'u1')

    expect(useAuthStore.getState().issuer).toBe('passport')
    expect(sessionStorage.getItem('bf_token_issuer')).toBe('passport')
    expect(session.sessionClient()).toBe(session.passportSupabase)
  })

  it('preserves it across a reload too, where the probe actually runs', async () => {
    // The probe's call happens in a FRESH module graph, so the preserved value has to come
    // out of sessionStorage rather than out of the store it is about to overwrite.
    const first = await loadWithPassport()
    first.useAuthStore.getState().setAuth('t1', 'u1', 'passport')

    const reloaded = await loadWithPassport()
    reloaded.useAuthStore.getState().setAuth('t2', 'u1')

    expect(reloaded.useAuthStore.getState().issuer).toBe('passport')
    expect(reloaded.session.sessionClient()).toBe(reloaded.session.passportSupabase)
  })

  it('lets a sign-in change the issuer, which is the only thing that may', async () => {
    const { session, useAuthStore } = await loadWithPassport()
    useAuthStore.getState().setAuth('t1', 'u1', 'passport')
    // `providers/supabase.tsx` and `providers/local.tsx` state `'app-native'` explicitly for
    // this reason: preserve-on-omit must not become "the issuer can never change".
    useAuthStore.getState().setAuth('t2', 'u2', 'app-native')
    expect(useAuthStore.getState().issuer).toBe('app-native')
    expect(session.sessionClient()).toBe(session.supabase)
  })

  // ⚠️ THE outage property. A timeout or a 5xx from the refresh is indistinguishable
  // here from a revocation, so calling `logout()` on a refresh failure would turn a
  // ten-minute Passport blip into a mass logout of every signed-in user — who then
  // cannot sign back in, because the thing that is down is the login.
  //
  // Both cases still end correctly: on an outage the stored access token is valid and
  // requests keep working, and on a genuine revocation the access token stays valid
  // until its own `exp` (the defined semantics of revoking a REFRESH token) after which
  // the first 401 drives the logout through `callJson`.
  it('a FAILED refresh keeps the stored token and does NOT log the user out', async () => {
    const { session, useAuthStore } = await loadWithPassport()
    useAuthStore.getState().setAuth('still-valid', 'u1', 'passport')

    for (const failure of [
      // An outage: the request never completes.
      () => Promise.reject(new Error('network down')),
      // A 5xx dressed as an auth error.
      () => Promise.resolve({ data: { session: null }, error: { message: 'server error' } }),
      // A genuine revocation, which must ALSO not log out here — the access token is
      // still valid until it expires.
      () => Promise.resolve({ data: { session: null }, error: { message: 'invalid grant' } }),
    ]) {
      supa.getSession.mockImplementationOnce(failure)

      await expect(session.getFreshAuthToken()).resolves.toBe('still-valid')
      expect(useAuthStore.getState().token).toBe('still-valid')
    }
  })

  it('signs out on the client that holds the session, with scope local', async () => {
    const { session, useAuthStore } = await loadWithPassport()
    useAuthStore.getState().setAuth('t', 'u1', 'passport')
    supa.signOut.mockResolvedValue({ error: null })

    await session.signOut()

    // The mock shares handlers between both clients, so this asserts the SCOPE; which
    // client is selected is asserted above.
    for (const call of supa.signOut.mock.calls) expect(call[0]).toEqual({ scope: 'local' })
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('mirrors session events from BOTH clients into the store', async () => {
    const { session } = await loadWithPassport()
    session.startSessionSync()

    // Only the client holding the session emits, so subscribing to our own project
    // alone would leave a hosted-login user's background refresh invisible to the route
    // guards, which read the store synchronously.
    expect(supa.onAuthStateChange).toHaveBeenCalledTimes(2)
  })
})
