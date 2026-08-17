import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'

/**
 * Where hosted login lands.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6B.
 *
 * ## The two assertions that matter, and why neither is obvious
 *
 * 1. **The session is established on PASSPORT'S client**, and the issuer is recorded as
 *    `'passport'`. Get either wrong and sign-in *appears to work*: the person lands on the
 *    app, every request succeeds, and then an hour later the refresh runs against the wrong
 *    GoTrue, fails, and they are signed out with nothing logged anywhere. Under the standard
 *    login that is every member.
 * 2. **The fragment is stripped from the URL**, before anything else. It carries a live
 *    access token and a live refresh token.
 *
 * Everything else here is an error path, because this page has no controls: if it does not
 * say what went wrong, the person is looking at a blank screen that says "Signing you in…"
 * for ever.
 */
const h = vi.hoisted(() => ({
  navigate: vi.fn(() => Promise.resolve()),
  setSession: vi.fn(),
  appSetSession: vi.fn(),
  setAuth: vi.fn(),
  hasPassportClient: true,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => h.navigate,
  // The route object is built at module load; `createRoute` needs to return something
  // shaped enough not to throw, and nothing here touches it.
  createRoute: (cfg: unknown) => cfg,
}))

vi.mock('./__root', () => ({ rootRoute: {} }))

vi.mock('@/auth/session', () => ({
  get passportSupabase() {
    return h.hasPassportClient
      ? { auth: { setSession: (...a: unknown[]) => h.setSession(...a) } }
      : null
  },
  // Present so a regression that reaches for the WRONG client is a visible call rather than
  // an undefined-property crash that reads like a different bug.
  supabase: { auth: { setSession: (...a: unknown[]) => h.appSetSession(...a) } },
}))

vi.mock('@/auth/store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ setAuth: h.setAuth }),
}))

vi.mock('@/components/AppLogo', () => ({ AppLogo: () => null }))

const fetchMock = vi.fn()

const TOKEN = 'passport-access-token'
const REFRESH = 'passport-refresh-token'

function landOn(hash: string) {
  window.history.replaceState({}, '', `/auth/passport/complete${hash}`)
}

async function renderPage() {
  const { passportCompleteRoute } = await import('./auth.passport.complete')
  const Page = (passportCompleteRoute as unknown as { component: () => ReactElement }).component
  return render(<Page />)
}

describe('the hosted-login callback page', () => {
  beforeEach(() => {
    vi.resetModules()
    h.navigate.mockReset()
    h.navigate.mockResolvedValue(undefined)
    h.setSession.mockReset()
    h.setSession.mockResolvedValue({ error: null })
    h.appSetSession.mockReset()
    h.setAuth.mockReset()
    h.hasPassportClient = true

    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'user-1' })))
    vi.stubGlobal('fetch', fetchMock)

    landOn(`#access_token=${TOKEN}&refresh_token=${REFRESH}&token_type=bearer`)
  })

  it('establishes the session on Passport’s client, not the app’s own', async () => {
    await renderPage()

    await waitFor(() =>
      expect(h.setSession).toHaveBeenCalledWith({ access_token: TOKEN, refresh_token: REFRESH }),
    )
    // The app's own client would reject this token — it was minted by a different project —
    // and report it as "token verification failed", which reads like a bad token.
    expect(h.appSetSession).not.toHaveBeenCalled()
  })

  it('records the issuer as passport, which is what makes the refresh work an hour later', async () => {
    await renderPage()

    await waitFor(() => expect(h.setAuth).toHaveBeenCalled())
    expect(h.setAuth).toHaveBeenCalledWith(TOKEN, 'user-1', 'passport')
  })

  it('resolves the person through OUR /me, with the token as a bearer', async () => {
    await renderPage()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/me')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('sends the person to the landing route, which resolves the workspace', async () => {
    await renderPage()
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/' }))
  })

  it('strips the tokens out of the URL', async () => {
    await renderPage()

    await waitFor(() => expect(h.setSession).toHaveBeenCalled())
    // A reload or a shared link must not carry a live session, and the fragment must not
    // survive into anything that reads `location.href`.
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/auth/passport/complete')
  })

  it('strips the URL even when the fragment is unusable', async () => {
    // The order is the point: the fragment goes before any branch on its contents, so a
    // half-formed one is not left sitting in the address bar while an error renders.
    landOn('#access_token=only-half-of-it')
    await renderPage()

    expect(await screen.findByText(/incomplete/i)).toBeTruthy()
    expect(window.location.hash).toBe('')
    expect(h.setSession).not.toHaveBeenCalled()
  })

  it('says so when this build has no Passport client configured', async () => {
    // A half-configured deployment: the server has hosted login, the bundle does not. The
    // person cannot fix it and the operator can, so it must not fail opaquely.
    h.hasPassportClient = false
    await renderPage()

    expect(await screen.findByText(/not configured/i)).toBeTruthy()
    expect(h.setAuth).not.toHaveBeenCalled()
  })

  it('surfaces a rejected session rather than hanging on "Signing you in…"', async () => {
    h.setSession.mockResolvedValue({ error: { message: 'Invalid Refresh Token' } })
    await renderPage()

    expect(await screen.findByText(/Invalid Refresh Token/)).toBeTruthy()
    expect(h.setAuth).not.toHaveBeenCalled()
    expect(h.navigate).not.toHaveBeenCalled()
  })

  it('surfaces a /me failure with its status', async () => {
    // The shape of a person who authenticated fine and has no access here. The server owns
    // that decision; this page only has to make it legible.
    fetchMock.mockResolvedValue(new Response('no access to this app', { status: 403 }))
    await renderPage()

    expect(await screen.findByText(/403/)).toBeTruthy()
    expect(await screen.findByText(/no access to this app/)).toBeTruthy()
    expect(h.setAuth).not.toHaveBeenCalled()
  })

  it('surfaces a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await renderPage()

    expect(await screen.findByText(/Failed to fetch/)).toBeTruthy()
    expect(h.setAuth).not.toHaveBeenCalled()
  })

  it('offers a way back on every error', async () => {
    // There is nothing else on this page. Without the link a failed sign-in is a dead end
    // that needs the person to know to edit the address bar.
    h.setSession.mockResolvedValue({ error: { message: 'nope' } })
    await renderPage()

    const back = await screen.findByRole('link', { name: /sign in/i })
    expect(back.getAttribute('href')).toBe('/login')
  })

  it('carries NO signed-in guard, so a stale token cannot bounce the new session away', async () => {
    const { passportCompleteRoute } = await import('./auth.passport.complete')
    // The other routes redirect a signed-in visitor to `/`. This page's job is to CREATE the
    // session, and a leftover token from a previous one would send the person away before
    // the new session is established — leaving them signed in as whoever they were before.
    expect(
      (passportCompleteRoute as unknown as { beforeLoad?: unknown }).beforeLoad,
    ).toBeUndefined()
  })
})
