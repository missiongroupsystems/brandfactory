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
import {
  collateralLibraryRoute,
  identityLibraryRoute,
  photographyLibraryRoute,
} from '@/routes/brands.$brandId.library'
import { projectRoute } from '@/routes/projects.$projectId'

const appRoutes = [
  indexRoute,
  loginRoute,
  workspacesIndexRoute,
  workspaceDetailRoute,
  workspaceSettingsRoute,
  brandEditorRoute,
  miniAppRoute,
  brandContextRoute,
  identityLibraryRoute,
  photographyLibraryRoute,
  collateralLibraryRoute,
  projectRoute,
] as const

// **The mockup route is gone as of 3G, and this is the whole of what it left
// behind.**
//
// 1.8.0 built it to review two unbuilt proposals as one page you could reject,
// and both are now shipped: brand assets in Stage 2, brand research in Stage 3.
// A fixture-backed copy of a surface that exists is the second source of truth
// the plan set out to avoid — the five research states it was once the only way
// to see are now reachable by running research, and its last unique capability
// (a job in flight, on demand) is not worth a route.
//
// What went with it: the mockup directory, its route file, the
// `import.meta.env.DEV` ternary that kept the route out of production builds,
// and both `/* @__PURE__ */` annotations that made the tree-shaking actually
// work. The plan asked for the deletion to be *checked* rather than assumed, and
// the checks are greps — so the paths are described here rather than spelled,
// which is what keeps those greps a signal instead of matching this comment.
//
// The cast is gone too. It existed to keep a dev-only route out of the router's
// *type* while leaving it in the runtime tree; with one list there is nothing to
// hide, and `addChildren` takes it directly.
const routeTree = rootRoute.addChildren(appRoutes)

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
