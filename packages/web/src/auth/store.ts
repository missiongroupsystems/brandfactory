import { create } from 'zustand'

const TOKEN_KEY = 'bf_token'

interface AuthState {
  token: string | null
  userId: string | null
  setAuth: (token: string, userId: string) => void
  setToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null,
  userId: null,
  setAuth: (token, userId) => {
    sessionStorage.setItem(TOKEN_KEY, token)
    set({ token, userId })
  },
  // Token-only update for session refresh: the access token rotates roughly
  // hourly while the identity behind it does not, so `userId` must survive.
  // `setAuth` can't do this job — it demands a userId the refresh path has no
  // fresh source for, and passing a placeholder would silently corrupt it.
  setToken: (token) => {
    sessionStorage.setItem(TOKEN_KEY, token)
    set({ token })
  },
  logout: () => {
    sessionStorage.removeItem(TOKEN_KEY)
    set({ token: null, userId: null })
  },
}))

// Safe to call outside React (beforeLoad, API client interceptors).
export function getAuthToken(): string | null {
  return useAuthStore.getState().token
}
