import { lazy, Suspense } from 'react'
import type { MiniApp } from '@/components/brand/miniApps'
import { PageHeader } from '@/components/layout/PageHeader'

// The split point. See `StudioSurface`'s own note for why the vendored runtime
// must not appear in any eagerly-imported module.
const StudioSurface = lazy(() => import('@/components/brand/StudioSurface'))

/**
 * `Studio` — the third shape behind `/brands/$brandId/apps/$appId`.
 *
 * The header is the same `PageHeader` every mini-app page uses, and it earns its
 * place here for the reason the hub tiles kept theirs in 1.15.0: the nav row
 * says *where you are*, and only this says *what it is for*. There is no action
 * slot — the surface below has its own toolbar, and a `New…` button would be
 * inventing a collection the app does not have (`MiniApp.unit`).
 *
 * `Suspense` rather than a router-level pending state: the chunk is large and
 * arrives after the shell, so the fallback belongs inside the page frame that is
 * already on screen — the header stays put and only the canvas area swaps.
 */
export function StudioPage({ brandId, app }: { brandId: string; app: MiniApp }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <PageHeader title={app.title} icon={app.icon} description={app.description} />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground" role="status">
            Loading the canvas…
          </p>
        }
      >
        <StudioSurface brandId={brandId} />
      </Suspense>
    </div>
  )
}
