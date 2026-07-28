import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from './store'
import { getFreshAuthToken, startSessionSync } from './session'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

interface MeResponse {
  id: string
}

export function AuthBoundary({ children }: { children: ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  // Lazy initializer reads store once at mount — no token means nothing to validate.
  const [ready, setReady] = useState(() => !useAuthStore.getState().token)

  // Any 401 anywhere clears the token (`callJson`, `useAgentChat`, `blobs`),
  // but clearing it used to leave the user parked on the page they were
  // already on: route guards only run in `beforeLoad`, so nothing re-evaluated
  // and they got a screen of stale cache under red error text. Watch the
  // transition instead of relying on a navigation happening to occur.
  useEffect(() => {
    return useAuthStore.subscribe((state, prev) => {
      if (prev.token && !state.token) {
        void navigate({ to: '/login' })
      }
    })
  }, [navigate])

  useEffect(() => {
    if (!useAuthStore.getState().token) return

    startSessionSync()

    const controller = new AbortController()
    // `getFreshAuthToken`, not the stored token: on a boot that happens more
    // than an hour after sign-in the stored copy is expired, and probing with
    // it would 401 and sign the user out of a session that is still perfectly
    // alive behind the refresh token.
    void getFreshAuthToken()
      .then(async (token) => {
        if (!token) {
          logout()
          await navigate({ to: '/login' })
          return
        }
        const res = await fetch(`${API_BASE}/me`, {
          headers: { authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!res.ok) {
          logout()
          await navigate({ to: '/login' })
          return
        }
        const data = (await res.json()) as MeResponse
        setAuth(token, data.id)
        setReady(true)
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name !== 'AbortError') {
          // Network error — proceed; the API client handles subsequent 401s.
          setReady(true)
        }
      })

    return () => controller.abort()
  }, [logout, navigate, setAuth])

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
