import { createRouter } from '@tanstack/react-router'
import { RouteError, RoutePending } from '@/components/RouteError'
import { rootRoute } from '@/routes/__root'
import { indexRoute } from '@/routes/index'
import { loginRoute } from '@/routes/login'
import { workspacesIndexRoute } from '@/routes/workspaces.index'
import { workspaceDetailRoute } from '@/routes/workspaces.$wsId.index'
import { workspaceSettingsRoute } from '@/routes/workspaces.$wsId.settings'
import { brandEditorRoute } from '@/routes/brands.$brandId'
import { miniAppRoute } from '@/routes/brands.$brandId.apps.$appId'
import { brandContextRoute } from '@/routes/brands.$brandId.context'
import { projectRoute } from '@/routes/projects.$projectId'

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  workspacesIndexRoute,
  workspaceDetailRoute,
  workspaceSettingsRoute,
  brandEditorRoute,
  miniAppRoute,
  brandContextRoute,
  projectRoute,
])

export const router = createRouter({
  routeTree,
  defaultErrorComponent: RouteError,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 400,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
