import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { queryClient } from '@/api/client'
import { type Me, meKeys } from '@/api/queries/me'
import { useAuthStore } from './store'
import { getFreshAuthToken, startSessionSync } from './session'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api') as string

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
        // **Cleared after the navigation, not before it.** Every cached row
        // belonged to the user who just left, and signing in as a second user
        // in the same tab would otherwise open on the first user's workspaces
        // while the refetches land. Clearing it here rather than inside
        // `signOut` covers the 401 paths too, which are the *other* three
        // callers of `logout()`.
        //
        // The order matters: `clear()` while the app's pages are still mounted
        // restarts every live query with no token behind it, which is a screen
        // of spinners and a burst of 401s on the way out the door. At `/login`
        // nothing is subscribed and the reset is silent.
        void navigate({ to: '/login' }).finally(() => queryClient.clear())
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
        const data = (await res.json()) as Me
        setAuth(token, data.id)
        // The probe already holds the whole row. `useMe` reads this key and
        // would otherwise fetch the identical response a second time on every
        // page load, purely because this one was parsed for its `id` and
        // dropped.
        queryClient.setQueryData(meKeys.me(), data)
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
