import { useEffect } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { useWorkspace, useWorkspaceBrands, useWorkspaceProjects } from '@/api/queries/workspaces'
import { setLastWorkspaceId } from '@/lib/last-workspace'
import { BrandCard } from '@/components/brand/BrandCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { NewBrandDialog } from '@/components/NewBrandDialog'
import { ProjectCard } from '@/components/project/ProjectCard'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Workspace home — the brands, and what was last touched in them
// ---------------------------------------------------------------------------
//
// **Resume comes first now, and that is the whole restructure.** This page used
// to open on the brand grid because the grid was also the *navigation* — the
// only way to reach a brand from here. The rail and the panel both list every
// brand in the workspace on every page of the app, so the grid is no longer the
// way in; it is the way to *survey*. What you cannot do from the sidebar is see
// which thread you were in yesterday, so that goes above it.
//
// The brand grid keeps its full detail (description, host, sections, project
// count) precisely because it is not a nav row: the nav is a name and a number,
// this is the place those numbers get their context.
//
// **The summary line is counts, never a score.** `4 brands · 18 threads` are two
// facts about a workspace; a percentage or a completeness bar would be the D2
// violation `GuidelineMeter` documents, one level up — a workspace, like a
// brand, is not deficient for being small.

function WorkspaceHomePage() {
  const { wsId } = workspaceDetailRoute.useParams()
  const { data: workspace, isPending: wsPending, isError: wsError } = useWorkspace(wsId)
  const { data: brands, isPending: brandsPending, isError: brandsError } = useWorkspaceBrands(wsId)
  const {
    data: recent,
    isPending: recentPending,
    isError: recentError,
  } = useWorkspaceProjects(wsId, 8)

  useEffect(() => {
    setLastWorkspaceId(wsId)
  }, [wsId])

  const hasBrands = (brands?.length ?? 0) > 0
  const hasProjects = (recent?.length ?? 0) > 0

  // `undefined` while the list is unknown, so the header renders no subtitle at
  // all rather than `0 brands` on every navigation into the workspace. The
  // thread total is summed from the brand rows — `BrandSummary.projectCount` is
  // already on that wire, so the line costs no request of its own.
  const summary = brands
    ? [
        `${brands.length} ${brands.length === 1 ? 'brand' : 'brands'}`,
        (() => {
          const threads = brands.reduce((sum, b) => sum + b.projectCount, 0)
          return `${threads} ${threads === 1 ? 'thread' : 'threads'}`
        })(),
      ].join(' · ')
    : undefined

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title={wsPending ? '…' : wsError ? 'Workspace' : (workspace?.name ?? '')}
          description={summary}
          action={<NewBrandDialog wsId={wsId} trigger={<Button size="sm">+ Brand</Button>} />}
        />

        {/* Above the grid only when there is something in it. On a workspace
            with no threads yet this section would be a heading over a sentence
            explaining its own absence, standing between the user and the one
            thing the page is asking them to do. */}
        {hasProjects && (
          <section className="mb-10">
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">
              Pick up where you left off
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {recent!.map((p) => (
                <ProjectCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  kind={p.kind}
                  brandId={p.brandId}
                  workspaceId={wsId}
                  brandName={p.brandName}
                  lastActivityAt={p.lastActivityAt}
                  showBrandName
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Brands</h2>

          {brandsPending && <p className="text-sm text-muted-foreground">Loading…</p>}
          {brandsError && <p className="text-sm text-destructive">Failed to load brands.</p>}

          {!brandsPending && !brandsError && brands?.length === 0 && (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
              <p className="font-medium">Add your first brand</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                A brand holds living guidelines — voice, audience, visuals — and the projects where
                you ideate with that context already loaded.
              </p>
              <NewBrandDialog wsId={wsId} trigger={<Button size="sm">+ Brand</Button>} />
            </div>
          )}

          {hasBrands && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {brands!.map((brand) => (
                <BrandCard key={brand.id} brand={brand} />
              ))}
            </div>
          )}
        </section>

        {/* The error, and only the error. A workspace whose brands have no
            threads yet needs no sentence about it — the brand grid below is
            already the next step, and the empty-state copy this replaces was
            two lines explaining that a thing you have not done has not been
            done. */}
        {recentError && !recentPending && (
          <p className="mt-6 text-sm text-destructive">Failed to load recent threads.</p>
        )}
      </div>
    </div>
  )
}

export const workspaceDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$wsId',
  beforeLoad: () => {
    if (!getAuthToken()) throw redirect({ to: '/login' })
  },
  component: WorkspaceHomePage,
})
