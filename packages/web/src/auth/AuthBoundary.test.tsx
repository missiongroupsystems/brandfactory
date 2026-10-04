import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/api/client'
import { meKeys } from '@/api/queries/me'
import { AuthBoundary } from './AuthBoundary'
import { useAuthStore } from './store'

/**
 * `AuthBoundary` reads `useMe()` to decide whether to draw the set-password
 * screen instead of the app, and `useQuery` needs a client in context.
 *
 * This is not a concession to the test. `main.tsx` wraps the whole router in
 * `QueryClientProvider` and `__root.tsx` renders the boundary inside the route
 * tree, so production already supplies exactly this. Rendering it bare was the
 * test being less like the app than it looked.
 */
function renderBoundary(ui: React.ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

const h = vi.hoisted(() => ({
  // Resolves, because the real `useNavigate` returns `Promise<void>` and the
  // boundary now chains the cache reset onto it. A bare `vi.fn()` here modelled
  // the router as returning `undefined`, which is not something it has ever
  // done.
  navigate: vi.fn(() => Promise.resolve()),
  token: 'fresh-token' as string | null,
  startSessionSync: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => h.navigate,
}))

vi.mock('./session', () => ({
  getFreshAuthToken: () => Promise.resolve(h.token),
  startSessionSync: () => h.startSessionSync(),
}))

const fetchMock = vi.fn()

describe('AuthBoundary', () => {
  beforeEach(() => {
    h.navigate.mockReset()
    h.navigate.mockResolvedValue(undefined)
    h.startSessionSync.mockReset()
    h.token = 'fresh-token'
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'u1', email: 'phil@example.com', displayName: 'Phil' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    queryClient.clear()
    useAuthStore.setState({ token: 'stale-token', userId: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.setState({ token: null, userId: null })
    queryClient.clear()
  })

  it('probes /me with a refreshed token, not the stored one', async () => {
    // The regression: on a boot more than an hour after sign-in the stored
    // copy is expired, and probing with it 401s and signs the user out of a
    // session that is still alive behind the refresh token.
    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )

    await screen.findByText('app')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/me'),
      expect.objectContaining({ headers: { authorization: 'Bearer fresh-token' } }),
    )
    expect(useAuthStore.getState().userId).toBe('u1')
    expect(h.navigate).not.toHaveBeenCalled()
  })

  it('starts the session sync so background refreshes reach the store', async () => {
    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )
    await screen.findByText('app')
    expect(h.startSessionSync).toHaveBeenCalled()
  })

  it('logs out and redirects when the refreshed token is still rejected', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))

    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/login' }))
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('redirects to /login when a 401 elsewhere clears the token', async () => {
    // Route guards only run in `beforeLoad`, so a mid-session logout left the
    // user parked on stale cache under red error text. Watch the transition.
    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )
    await screen.findByText('app')
    expect(h.navigate).not.toHaveBeenCalled()

    act(() => {
      useAuthStore.getState().logout()
    })

    expect(h.navigate).toHaveBeenCalledWith({ to: '/login' })
  })

  it('does not redirect on a token change that is a refresh, not a logout', async () => {
    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )
    await screen.findByText('app')

    act(() => {
      useAuthStore.getState().setToken('rotated')
    })

    expect(h.navigate).not.toHaveBeenCalled()
  })

  it('renders children immediately when there is no token to validate', () => {
    useAuthStore.setState({ token: null, userId: null })

    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )

    expect(screen.getByText('app')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('primes the /me cache from the boot probe, so nothing fetches it twice', async () => {
    // The probe already holds the whole row. Parsing it for the `id` and
    // dropping the rest is what made `useMe` a second identical round trip on
    // every page load.
    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )

    await screen.findByText('app')
    expect(queryClient.getQueryData(meKeys.me())).toEqual({
      id: 'u1',
      email: 'phil@example.com',
      displayName: 'Phil',
    })
  })

  it('empties the query cache on logout, but only once /login is reached', async () => {
    // Every cached row belongs to the user who just left. Clearing it while the
    // app's pages are still mounted restarts every live query with no token
    // behind it — a screen of spinners and a burst of 401s on the way out.
    let arriveAtLogin = () => {}
    h.navigate.mockReturnValue(
      new Promise<void>((resolve) => {
        arriveAtLogin = resolve
      }),
    )

    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )
    await screen.findByText('app')
    queryClient.setQueryData(['workspaces'], [{ id: 'ws-1' }])

    act(() => {
      useAuthStore.getState().logout()
    })
    expect(queryClient.getQueryData(['workspaces'])).toBeDefined()

    await act(async () => {
      arriveAtLogin()
    })
    expect(queryClient.getQueryData(['workspaces'])).toBeUndefined()
    expect(queryClient.getQueryData(meKeys.me())).toBeUndefined()
  })

  it('lets the app through on a network error so the API client handles later 401s', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))

    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )

    await screen.findByText('app')
    expect(h.navigate).not.toHaveBeenCalled()
    expect(useAuthStore.getState().token).toBe('stale-token')
  })
})

describe('AuthBoundary and the set-password flag', () => {
  // The Vite app needs this screen for the same reason `web-next` does: both
  // are deployed, and a flagged account that opened this one without it would
  // meet PASSWORD_NOT_SET on every query and read it as a broken product.
  beforeEach(() => {
    h.navigate.mockReset()
    h.navigate.mockResolvedValue(undefined)
    h.token = 'fresh-token'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    queryClient.clear()
    useAuthStore.setState({ token: 'stale-token', userId: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.setState({ token: null, userId: null })
    queryClient.clear()
  })

  function probeReturns(mustSetPassword: boolean) {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'u1', email: 'phil@example.com', mustSetPassword }), {
        status: 200,
      }),
    )
  }

  it('draws the set-password screen instead of the app when the flag is set', async () => {
    probeReturns(true)
    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )

    await screen.findByText('Choose your password')
    expect(screen.queryByText('app')).toBeNull()
    // A render gate, not a redirect: nothing navigates, so there is no URL a
    // reader can come back from.
    expect(h.navigate).not.toHaveBeenCalled()
  })

  it('draws the app once the flag is clear', async () => {
    probeReturns(false)
    renderBoundary(
      <AuthBoundary>
        <p>app</p>
      </AuthBoundary>,
    )
    await screen.findByText('app')
    expect(screen.queryByText('Choose your password')).toBeNull()
  })
})
