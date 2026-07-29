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
import { demoBrandRoute } from '@/routes/demo.brand'
import { demoBrandAssetsRoute } from '@/routes/demo.brand.assets'

const appRoutes = [
  indexRoute,
  loginRoute,
  workspacesIndexRoute,
  workspaceDetailRoute,
  workspaceSettingsRoute,
  brandEditorRoute,
  miniAppRoute,
  brandContextRoute,
  projectRoute,
] as const

// The front-end mockup's two routes (`docs/executing/brand-hub-fe-mockup.md`).
//
// **Gated on `import.meta.env.DEV`, not on remembering to delete them.** Vite
// replaces that expression with a literal in a production build, so the ternary
// is dead code, the imports are unreferenced, and the routes are tree-shaken out
// of the bundle. That makes "dev-only" a build-time fact for the *duration* of
// the pass rather than a checklist item at the end of it — any deploy in between
// would otherwise ship a fixture-backed page into the live app.
//
// The cast is what keeps the demo out of the router's **type** while leaving it
// in the runtime tree: every `<Link to="…">` in the app is checked against
// `appRoutes` alone, so a dev-only path can never become a typed destination
// product code is allowed to reach for. The demo navigates with plain `<a>` for
// exactly that reason.
const routeTree = rootRoute.addChildren([
  ...appRoutes,
  ...(import.meta.env.DEV ? [demoBrandRoute, demoBrandAssetsRoute] : []),
] as unknown as typeof appRoutes)

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
