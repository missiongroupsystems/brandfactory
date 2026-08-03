import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { useBrand, useBrandProjects } from '@/api/queries/brands'
import type { MiniApp } from '@/components/brand/miniApps'
import { miniAppById } from '@/components/brand/miniApps'
import { VisualIdentityPage } from '@/components/brand/VisualIdentityPage'
import { PageHeader } from '@/components/layout/PageHeader'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { ProjectCard } from '@/components/project/ProjectCard'
import { StudioPage } from '@/components/brand/StudioPage'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Mini-app page — a category workspace
// ---------------------------------------------------------------------------
//
// Three shapes behind one route, chosen by the registry's `unit`:
//
//   unit: 'thread'  → the thread list this page has always been
//   unit: 'asset'   → `VisualIdentityPage`, the asset library (2E)
//   unit: 'canvas'  → `StudioPage`, the vendored toolcraft surface
//
// They are separate components rather than one with branches, because each owns
// a different set of queries: the thread page needs `useBrandProjects`, the
// library needs `useBrandAssets` and four mutations, and neither should pay for
// the other's. `StudioPage` makes the point twice over — it needs no query at
// all, and it lazy-loads a chunk the other two must never pull in.
//
// The breadcrumb trail this used to publish is gone with the header that
// rendered it: the side-nav lights this category's own row, and the threads
// under it, which is the same fact with somewhere to click.

function MiniAppPage() {
  const { brandId, appId } = miniAppRoute.useParams()
  const app = miniAppById(appId)

  if (!app) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <h1>Unknown mini-app</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          No mini-app is registered under &ldquo;{appId}&rdquo;.
        </p>
      </div>
    )
  }

  if (app.unit === 'asset') return <VisualIdentityPage brandId={brandId} app={app} />
  if (app.unit === 'canvas') return <StudioPage brandId={brandId} app={app} />
  return <ThreadListPage brandId={brandId} app={app} />
}

function ThreadListPage({ brandId, app }: { brandId: string; app: MiniApp }) {
  const { data: brand, isPending: brandPending, isError: brandError } = useBrand(brandId)
  const {
    data: projects,
    isPending: threadsPending,
    isError: threadsError,
  } = useBrandProjects(brandId)

  const Icon = app.icon
  // Client-side filtering: the threads endpoint is per-brand, and a brand's
  // thread count is small enough that a server-side template filter would be
  // premature (see the plan's non-goals).
  const threads = projects?.filter(app.match) ?? []

  // ProjectCard needs a `workspaceId`, which only the brand query supplies, so
  // the list is gated on BOTH queries. Collapsing them into one pending/error
  // pair is what keeps a failed brand fetch from rendering an empty page with
  // no explanation — the threads themselves may well have loaded fine.
  const listPending = brandPending || threadsPending
  const listError = brandError || threadsError

  return (
    <div className="flex-1 overflow-auto p-6">
      <PageHeader
        title={app.title}
        icon={Icon}
        description={app.description}
        action={
          app.enabled &&
          brand && (
            <NewProjectDialog
              brandId={brand.id}
              workspaceId={brand.workspaceId}
              templateId={app.create.kind === 'standardized' ? app.create.templateId : undefined}
              title="New thread"
              trigger={<Button size="sm">New thread</Button>}
            />
          )
        }
      />

      {!app.enabled && (
        <div className="mb-6 rounded-lg border border-dashed bg-card p-6">
          <p className="text-sm font-medium">Coming soon</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {app.title} gets a purpose-built surface in a later pass. Until then, Open canvas covers
            the same ground in a freeform thread.
          </p>
        </div>
      )}

      {listError && (
        <p className="text-sm text-destructive">
          {brandError ? 'Failed to load this brand.' : 'Failed to load threads.'}
        </p>
      )}
      {!listError && listPending && (
        <p className="text-sm text-muted-foreground">Loading threads…</p>
      )}
      {!listError &&
        !listPending &&
        brand &&
        (threads.length > 0 ? (
          <>
            {/* A not-yet-live mini-app still lists whatever threads exist under
                its template — the hub tile advertises that count, so the page it
                points at must not be a dead end. Creating more stays disabled. */}
            {!app.enabled && (
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Existing threads</h2>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {threads.map((p) => (
                <ProjectCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  kind={p.kind}
                  brandId={brand.id}
                  workspaceId={brand.workspaceId}
                  lastActivityAt={p.lastActivityAt}
                  showBrandName={false}
                />
              ))}
            </div>
          </>
        ) : app.enabled ? (
          <p className="text-sm text-muted-foreground">
            No threads yet. Start your first {app.title.toLowerCase()} thread — it opens with this
            brand&apos;s context already loaded.
          </p>
        ) : null)}
    </div>
  )
}

export const miniAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brands/$brandId/apps/$appId',
  beforeLoad: ({ params }) => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
    // `miniAppById` resolves by id with no surface check, so without this a
    // hidden row would render a second, unintended surface for its threads
    // under /apps/ — exactly the "it's a peer tile after all" framing the
    // hidden surface exists to prevent. Redirect to the row's real home.
    // An unregistered id still falls through to the unknown-app branch above.
    const app = miniAppById(params.appId)
    if (app && app.surface !== 'tile') {
      throw redirect({ to: '/brands/$brandId/context', params: { brandId: params.brandId } })
    }
  },
  component: MiniAppPage,
})
