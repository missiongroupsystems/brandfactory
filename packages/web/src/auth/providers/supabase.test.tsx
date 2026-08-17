import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SupabaseAuthProvider } from './supabase'

/**
 * The email-first login screen.
 *
 * Plan: `docs/executing/passport-sync-consumer-plan.md`, phase 6B.
 * Contract: the standard consumer login in `reference/sso-login.md` — one email field, the
 * app decides, and the person is **never asked which kind of account they have**.
 *
 * ## What is worth asserting here
 *
 * Not that a form renders. Three properties, each of which fails silently and each of
 * which somebody will "simplify" away:
 *
 * 1. **Step 1 offers no choice.** No SSO button, no toggle, no provider hint. The moment
 *    one appears the screen is asking the question it exists to answer.
 * 2. **A member never reaches step 2**, and gets a FULL-PAGE navigation rather than a
 *    fetch — the redirect chain has to happen in the browser, and a `fetch` here would
 *    "work" in the sense of returning 302 and then do nothing at all.
 * 3. **An error in the URL lands on step 2.** Otherwise `no_access` is an infinite bounce:
 *    the only control is Continue, which routes the same address back to the branch that
 *    just failed.
 */
const h = vi.hoisted(() => ({
  navigate: vi.fn(() => Promise.resolve()),
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => h.navigate,
}))

vi.mock('@/auth/session', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...a: unknown[]) => h.signInWithOtp(...a),
      signInWithOAuth: (...a: unknown[]) => h.signInWithOAuth(...a),
      getSession: () => h.getSession(),
      exchangeCodeForSession: (...a: unknown[]) => h.exchangeCodeForSession(...a),
    },
  },
}))

const fetchMock = vi.fn()
const assign = vi.fn()

function setUrl(url: string) {
  window.history.replaceState({}, '', url)
}

/**
 * `window.location` with a stubbed `assign` and every URL property still LIVE.
 *
 * Two constraints meet here and both rule out the obvious approach.
 *
 * - **`assign` cannot be replaced in place.** jsdom defines it as a read-only,
 *   non-configurable OWN data property, so `defineProperty` raises
 *   `Cannot redefine property: assign` — and a `Proxy` cannot help either: returning
 *   anything but the real function from a `get` trap violates a proxy invariant and throws.
 *   It has to go through `window`.
 * - **A snapshot of `location` is a trap.** `defineProperty(window, 'location', { value: { ...location } })`
 *   copies the URL fields once. `history.replaceState` then updates the real Location while
 *   the component keeps reading the frozen copy, so every error-arrival test sees a bare
 *   `/login`, renders step 1, and fails as though the component were wrong.
 *
 * So: a plain object — which carries none of Location's invariants — with a live getter per
 * URL field delegating to the original, and `assign` as the spy. `originalLocation` is
 * captured at module scope, once, because after the first install `window.location` is this
 * stub and a re-capture would nest it.
 */
const originalLocation = window.location

const LIVE_FIELDS = [
  'href',
  'origin',
  'protocol',
  'host',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
] as const

function installLocationStub() {
  const stub: Record<string, unknown> = {
    assign,
    // `replace` and `reload` navigate too, so they would throw jsdom's "Not implemented"
    // just as loudly. Nothing under test calls them; they are here so that a future one
    // fails an assertion rather than the whole file.
    replace: assign,
    reload: () => {},
    toString: () => originalLocation.href,
  }
  for (const field of LIVE_FIELDS) {
    Object.defineProperty(stub, field, {
      enumerable: true,
      get: () => originalLocation[field],
    })
  }
  Object.defineProperty(window, 'location', { configurable: true, value: stub })
}

installLocationStub()

describe('SupabaseAuthProvider — the email-first screen', () => {
  beforeEach(() => {
    for (const m of Object.values(h)) m.mockReset()
    h.navigate.mockResolvedValue(undefined)
    h.getSession.mockResolvedValue({ data: { session: null } })
    h.signInWithOtp.mockResolvedValue({ error: null })
    h.signInWithOAuth.mockResolvedValue({ error: null })

    fetchMock.mockReset()
    // Default: the server routes this address to the app's own login.
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ route: 'app-native' })))
    vi.stubGlobal('fetch', fetchMock)

    assign.mockReset()
    setUrl('/login')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── Step 1 ────────────────────────────────────────────────────────────────

  it('starts with ONE field and ONE button, and offers no choice of provider', async () => {
    render(<SupabaseAuthProvider />)
    await waitFor(() => expect(h.getSession).toHaveBeenCalled())

    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy()

    // The whole point of the screen. Any of these appearing on step 1 puts the "which kind
    // of account do you have?" question back in front of somebody who cannot answer it.
    expect(screen.queryByRole('button', { name: /google/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /magic link/i })).toBeNull()
    expect(screen.queryByText(/single sign-on|sso|passport/i)).toBeNull()
  })

  it('sends a member to hosted login with a full-page navigation, never to step 2', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ route: 'passport' })))
    render(<SupabaseAuthProvider />)
    await waitFor(() => expect(h.getSession).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/email/i), 'member@example.com')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/api/auth/passport/start'))
    // Not revealed underneath. A member who sees a magic-link button can authenticate
    // around Passport entirely.
    expect(screen.queryByRole('button', { name: /magic link/i })).toBeNull()
    expect(h.signInWithOtp).not.toHaveBeenCalled()
  })

  it('reveals step 2 in place for a non-member, with no page transition', async () => {
    render(<SupabaseAuthProvider />)
    await waitFor(() => expect(h.getSession).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/email/i), 'outsider@example.com')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    await screen.findByRole('button', { name: /magic link/i })
    expect(screen.getByRole('button', { name: /google/i })).toBeTruthy()
    expect(assign).not.toHaveBeenCalled()
  })

  it('carries the typed email into step 2 and sends the link to it', async () => {
    render(<SupabaseAuthProvider />)
    await waitFor(() => expect(h.getSession).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/email/i), '  outsider@example.com  ')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(await screen.findByRole('button', { name: /magic link/i }))

    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalled())
    // Trimmed. A trailing space survives an autofill and a paste, and GoTrue treats it as a
    // different address — the link goes nowhere and the screen still says "check your email".
    expect(h.signInWithOtp.mock.calls[0]?.[0]).toMatchObject({ email: 'outsider@example.com' })
  })

  it('keeps the email editable on step 2', async () => {
    // A typo is the most common failure on this screen, and it is invisible: the magic link
    // is "sent", nothing errors, and the person waits for mail that will never arrive.
    render(<SupabaseAuthProvider />)
    await waitFor(() => expect(h.getSession).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/email/i), 'typo@example.con')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByRole('button', { name: /magic link/i })

    const field = screen.getByLabelText(/email/i) as HTMLInputElement
    expect(field.value).toBe('typo@example.con')
    await userEvent.clear(field)
    await userEvent.type(field, 'fixed@example.com')
    await userEvent.click(screen.getByRole('button', { name: /magic link/i }))

    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalled())
    expect(h.signInWithOtp.mock.calls[0]?.[0]).toMatchObject({ email: 'fixed@example.com' })
  })

  it('routes the address as typed, and never judges it itself', async () => {
    // The app adds NO check of its own beyond the field's `type="email"`. An address the
    // browser accepts goes to the server exactly as typed, however odd it looks — an
    // intranet host with no dot is valid to both the browser and to Passport, and a
    // stricter regex here would make it unroutable with no way to tell why.
    //
    // The deeper reason is that any client-side verdict on an address is a second oracle.
    // The server's answer is deliberately shaped to disclose nothing (a non-member and a
    // nonexistent address are the same reply); a browser-side "we don't know that address"
    // would give away exactly what that costs a round trip to hide.
    render(<SupabaseAuthProvider />)
    await waitFor(() => expect(h.getSession).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/email/i), 'someone@intranet')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/resolve-login')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'someone@intranet' })
    // No verdict rendered about the address itself.
    expect(screen.queryByText(/invalid|not found|unknown|no account/i)).toBeNull()
  })

  it('lets the browser block a malformed address, and stays on step 1', async () => {
    // Documented, not asserted as ideal: the field is `type="email" required`, so native
    // constraint validation refuses to submit and `handleContinue` never runs. Worth pinning
    // because the behaviour is invisible in review — the click simply does nothing, with no
    // message from us — and because it is the one place a format check DOES exist.
    render(<SupabaseAuthProvider />)
    await waitFor(() => expect(h.getSession).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy()
  })

  it('falls through to step 2 when the routing call fails', async () => {
    // The degradation path, end to end through the component: a Passport outage or a
    // 500 leaves the login working exactly as it did before this phase.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<SupabaseAuthProvider />)
    await waitFor(() => expect(h.getSession).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/email/i), 'member@example.com')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    await screen.findByRole('button', { name: /magic link/i })
    expect(assign).not.toHaveBeenCalled()
  })

  // ── Arriving on an error ──────────────────────────────────────────────────

  it('starts on step 2 when the URL carries one of our error codes', async () => {
    setUrl('/login?error=no_access')
    render(<SupabaseAuthProvider />)

    // Step 2 immediately — not behind a Continue click that would bounce straight back to
    // the SSO branch that just refused them.
    await screen.findByRole('button', { name: /magic link/i })
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull()
  })

  it('shows the human message for our code, never the raw code', async () => {
    setUrl('/login?error=no_access')
    render(<SupabaseAuthProvider />)

    expect(await screen.findByText(/no access/i)).toBeTruthy()
    expect(screen.queryByText(/no_access/)).toBeNull()
  })

  it('still shows Supabase’s own error, which arrives in the same parameter', async () => {
    // The regression this ordering fixes. Both namespaces write `?error=`, so a catch-all
    // read of ours would replace a real magic-link failure with an SSO message.
    setUrl('/login?error=access_denied&error_description=Email+link+is+invalid+or+has+expired')
    render(<SupabaseAuthProvider />)

    expect(await screen.findByText(/Email link is invalid or has expired/i)).toBeTruthy()
  })

  it('reads an error out of the hash as well', async () => {
    setUrl('/login#error=otp_expired&error_description=Token+has+expired')
    render(<SupabaseAuthProvider />)

    expect(await screen.findByText(/Token has expired/i)).toBeTruthy()
  })
})
