import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { ensureWorkspaces, resolveLandingWorkspaceId } from '@/lib/workspace-resolve'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    // Magic-link redirects can land at `/` instead of `/login` when Supabase
    // falls back to the Site URL (because `/login` isn't in the Redirect URL
    // allow-list). A plain `redirect({ to: '/login' })` strips the `?code=`
    // before SupabaseAuthProvider can exchange it. Forward the full URL so
    // the auth params survive.
    if (typeof window !== 'undefined') {
      const { search, hash } = window.location
      const hasAuthParams =
        search.includes('code=') || search.includes('error=') || hash.includes('access_token=')
      if (hasAuthParams) {
        window.location.replace(`/login${search}${hash}`)
        // Stop the router from rendering anything in the meantime.
        throw redirect({ to: '/login' })
      }
    }
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  loader: async () => {
    const workspaces = await ensureWorkspaces()
    const wsId = resolveLandingWorkspaceId(workspaces)
    if (wsId) {
      throw redirect({ to: '/workspaces/$wsId', params: { wsId } })
    }
    // First-run: no workspaces yet.
    throw redirect({ to: '/workspaces' })
  },
})
