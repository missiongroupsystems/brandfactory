import { useEffect } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { useWorkspace, useWorkspaceBrands, useWorkspaceProjects } from '@/api/queries/workspaces'
import { setLastWorkspaceId } from '@/lib/last-workspace'
import { BrandCard } from '@/components/brand/BrandCard'
import { NewBrandDialog } from '@/components/NewBrandDialog'
import { ProjectCard } from '@/components/project/ProjectCard'
import { Button } from '@/components/ui/button'

function WorkspaceHomePage() {
  const { wsId } = workspaceDetailRoute.useParams()
  const { data: workspace, isPending: wsPending, isError: wsError } = useWorkspace(wsId)
  const { data: brands, isPending: brandsPending, isError: brandsError } = useWorkspaceBrands(wsId)
  const {
    data: recent,
    isPending: recentPending,
    isError: recentError,
  } = useWorkspaceProjects(wsId, 10)

  useEffect(() => {
    setLastWorkspaceId(wsId)
  }, [wsId])

  const hasBrands = (brands?.length ?? 0) > 0
  const hasProjects = (recent?.length ?? 0) > 0

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="min-w-0 truncate">
          {wsPending ? '…' : wsError ? 'Workspace' : workspace?.name}
        </h1>
        <NewBrandDialog wsId={wsId} trigger={<Button size="sm">+ Brand</Button>} />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground">Brands</h2>

        {brandsPending && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {brandsError && <p className="mt-4 text-sm text-destructive">Failed to load brands.</p>}

        {!brandsPending && !brandsError && brands?.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">Add your first brand</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A brand holds living guidelines — voice, audience, visuals — and the projects where
              you ideate with that context already loaded.
            </p>
            <NewBrandDialog wsId={wsId} trigger={<Button size="sm">+ Brand</Button>} />
          </div>
        )}

        {hasBrands && (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {brands!.map((brand) => (
              <BrandCard key={brand.id} brand={brand} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-muted-foreground">Recent work</h2>

        {recentPending && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {recentError && (
          <p className="mt-4 text-sm text-destructive">Failed to load recent projects.</p>
        )}

        {!recentPending && !recentError && hasBrands && !hasProjects && (
          <p className="mt-4 text-sm text-muted-foreground">Open a brand to start a project.</p>
        )}

        {!recentPending && !recentError && !hasBrands && (
          <p className="mt-4 text-sm text-muted-foreground">
            Projects will show up here once you have a brand and start creating.
          </p>
        )}

        {hasProjects && (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
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
        )}
      </section>
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
