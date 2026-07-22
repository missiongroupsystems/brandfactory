import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { ensureWorkspaces, resolveLandingWorkspaceId } from '@/lib/workspace-resolve'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
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
