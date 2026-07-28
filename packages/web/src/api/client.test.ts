import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, AppError, callJson } from './client'
import { useAuthStore } from '@/auth/store'

const h = vi.hoisted(() => ({ freshToken: 'fresh' as string | null }))

vi.mock('@/auth/session', () => ({
  getFreshAuthToken: () => Promise.resolve(h.freshToken),
}))

describe('callJson', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: 'tok', userId: 'u1' })
  })

  afterEach(() => {
    useAuthStore.setState({ token: null, userId: null })
  })

  it('parses JSON on 2xx', async () => {
    const res = new Response(JSON.stringify({ hello: 'world' }), { status: 200 })
    await expect(callJson<{ hello: string }>(res)).resolves.toEqual({ hello: 'world' })
  })

  it('throws AppError with server-supplied code + message on non-2xx', async () => {
    const res = new Response(JSON.stringify({ code: 'BAD_THING', message: 'Nope' }), {
      status: 400,
      statusText: 'Bad Request',
    })
    await expect(callJson(res)).rejects.toMatchObject({
      name: 'AppError',
      code: 'BAD_THING',
      message: 'Nope',
      status: 400,
    })
  })

  it('falls back to statusText when the error body is not JSON', async () => {
    const res = new Response('<html>boom</html>', { status: 500, statusText: 'Server Error' })
    const err = await callJson(res).catch((e) => e as AppError)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('UNKNOWN')
    expect((err as AppError).status).toBe(500)
  })

  it('logs the user out on 401', async () => {
    const logout = vi.fn()
    useAuthStore.setState({ token: 'tok', userId: 'u1', logout })
    const res = new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 })
    await callJson(res).catch(() => undefined)
    expect(logout).toHaveBeenCalled()
  })
})

describe('api auth header', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    h.freshToken = 'fresh'
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    // A stale copy in the store — what the client used to send verbatim until
    // the user reloaded the tab.
    useAuthStore.setState({ token: 'expired', userId: 'u1' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.setState({ token: null, userId: null })
  })

  function sentHeaders(): Headers {
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit]
    return new Headers(init.headers)
  }

  it('sends the freshly resolved token, not the cached store copy', async () => {
    await api.me.$get()
    expect(sentHeaders().get('authorization')).toBe('Bearer fresh')
  })

  it('resolves the token per request, so a rotation is picked up without re-creating the client', async () => {
    await api.me.$get()
    h.freshToken = 'rotated'
    await api.me.$get()

    const [, second] = fetchMock.mock.calls[1] as [unknown, RequestInit]
    expect(new Headers(second.headers).get('authorization')).toBe('Bearer rotated')
  })

  it('omits the header entirely when no token resolves', async () => {
    h.freshToken = null
    await api.me.$get()
    expect(sentHeaders().has('authorization')).toBe(false)
  })
})

describe('AppError', () => {
  it('carries name, code, status, and message', () => {
    const err = new AppError('boom', 'X', 418)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AppError')
    expect(err.code).toBe('X')
    expect(err.status).toBe(418)
    expect(err.message).toBe('boom')
  })
})
